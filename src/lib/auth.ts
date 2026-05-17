import { cookies, headers } from "next/headers";
import { db } from "./db";
import { users, sessions, authEvents, invites, passwordResets, emailVerifications, notifications, auditLogs } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID, randomBytes, createHmac } from "crypto";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "sc_session";
const SESSION_DAYS = 30;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type Role =
  | "SUPER_ADMIN" | "AGENCY_ADMIN" | "COORDINATOR" | "COMPLIANCE"
  | "FINANCE" | "WORKER" | "CLIENT";

export type SessionUser = {
  id: string; agencyId: string; email: string;
  firstName: string; lastName: string; role: Role;
  emailVerified: boolean; mfaEnabled: boolean;
  impersonatorId?: string | null;
};

async function ipUa() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for") || h.get("x-real-ip") || null,
    ua: h.get("user-agent") || null,
  };
}

export async function logAuth(type: string, opts: { userId?: string | null; email?: string | null; meta?: object }) {
  const { ip, ua } = await ipUa();
  (await db.insert(authEvents).values({
    id: randomUUID(),
    userId: opts.userId ?? null,
    email: opts.email ?? null,
    type, ip, userAgent: ua,
    meta: opts.meta ? JSON.stringify(opts.meta) : null,
  }).run());
}

export async function audit(actorId: string | null, agencyId: string | null, action: string, target?: { type: string; id: string }, meta?: object) {
  (await db.insert(auditLogs).values({
    id: randomUUID(),
    actorId, agencyId,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    meta: meta ? JSON.stringify(meta) : null,
  }).run());
}

export async function notify(userId: string, n: { type: string; title: string; body?: string; href?: string }) {
  (await db.insert(notifications).values({
    id: randomUUID(), userId, ...n,
  }).run());
}

/* ─── login / session ────────────────────────────────────────── */

export type LoginResult =
  | { ok: true; userId: string; mfaRequired: boolean }
  | { ok: false; reason: "INVALID" | "LOCKED" | "SUSPENDED" | "UNVERIFIED" };

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = (await db.select().from(users).where(eq(users.email, email.toLowerCase())).get());
  if (!user) {
    await logAuth("LOGIN_FAIL", { email, meta: { reason: "no_user" } });
    return { ok: false, reason: "INVALID" };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await logAuth("LOGIN_FAIL", { userId: user.id, email, meta: { reason: "locked" } });
    return { ok: false, reason: "LOCKED" };
  }
  if (user.status === "SUSPENDED" || user.status === "INACTIVE") {
    await logAuth("LOGIN_FAIL", { userId: user.id, email, meta: { reason: user.status } });
    return { ok: false, reason: "SUSPENDED" };
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const fc = (user.failedLoginCount || 0) + 1;
    const update: Partial<typeof users.$inferInsert> = { failedLoginCount: fc };
    if (fc >= MAX_FAILED) {
      update.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      update.failedLoginCount = 0;
      await logAuth("LOCKED", { userId: user.id, email });
    }
    (await db.update(users).set(update).where(eq(users.id, user.id)).run());
    await logAuth("LOGIN_FAIL", { userId: user.id, email });
    return { ok: false, reason: "INVALID" };
  }

  // reset failures
  (await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id)).run());

  if (user.mfaEnabled) {
    // Pending-MFA: short cookie holding userId; not a full session
    const cookieStore = await cookies();
    cookieStore.set("sc_pending_mfa", user.id, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 5 * 60,
    });
    await logAuth("LOGIN_OK_MFA_REQ", { userId: user.id, email });
    return { ok: true, userId: user.id, mfaRequired: true };
  }

  await createSessionFor(user.id);
  await logAuth("LOGIN_OK", { userId: user.id, email });
  return { ok: true, userId: user.id, mfaRequired: false };
}

export async function createSessionFor(userId: string, impersonatorId?: string | null) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  const { ip, ua } = await ipUa();
  (await db.insert(sessions).values({ id: sessionId, userId, impersonatorId: impersonatorId ?? null, expiresAt, ip, userAgent: ua }).run());
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", expires: expiresAt, path: "/" });
}

export async function verifyMfaAndLogin(code: string): Promise<boolean> {
  const cookieStore = await cookies();
  const userId = cookieStore.get("sc_pending_mfa")?.value;
  if (!userId) return false;
  const user = (await db.select().from(users).where(eq(users.id, userId)).get());
  if (!user || !user.mfaSecret) return false;
  const ok = verifyTotp(user.mfaSecret, code);
  if (!ok) {
    await logAuth("MFA_FAIL", { userId, email: user.email });
    return false;
  }
  cookieStore.delete("sc_pending_mfa");
  await createSessionFor(userId);
  await logAuth("MFA_OK", { userId, email: user.email });
  return true;
}

export async function logout() {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (sid) {
    const s = (await db.select().from(sessions).where(eq(sessions.id, sid)).get());
    if (s) await logAuth("LOGOUT", { userId: s.userId });
    (await db.delete(sessions).where(eq(sessions.id, sid)).run());
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const session = (await db.select().from(sessions).where(eq(sessions.id, sid)).get());
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const user = (await db.select().from(users).where(eq(users.id, session.userId)).get());
  if (!user) return null;
  return {
    id: user.id, agencyId: user.agencyId, email: user.email,
    firstName: user.firstName, lastName: user.lastName, role: user.role as Role,
    emailVerified: !!user.emailVerifiedAt, mfaEnabled: !!user.mfaEnabled,
    impersonatorId: session.impersonatorId ?? null,
  };
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const s = await requireSession();
  if (!roles.includes(s.role)) redirect("/login");
  return s;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("AGENCY_ADMIN", "COORDINATOR", "COMPLIANCE", "FINANCE");
}
export async function requireWorker(): Promise<SessionUser> {
  return requireRole("WORKER");
}
export async function requireSuperAdmin(): Promise<SessionUser> {
  const s = await requireSession();
  if (s.role !== "SUPER_ADMIN") redirect("/login");
  return s;
}

/* ─── impersonation (super-admin → agency admin) ─────────────── */

export async function startImpersonation(agencyId: string) {
  const su = await requireSuperAdmin();
  const target = (await db
    .select()
    .from(users)
    .where(eq(users.agencyId, agencyId))
    .all())
    .find((u) => u.role === "AGENCY_ADMIN" && u.status === "ACTIVE");
  if (!target) redirect("/platform?error=no_admin");
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (sid) (await db.delete(sessions).where(eq(sessions.id, sid)).run());
  await createSessionFor(target!.id, su.id);
  await audit(su.id, agencyId, "platform.impersonate.start", { type: "agency", id: agencyId });
  redirect("/admin");
}

export async function stopImpersonation() {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sid) redirect("/login");
  const session = (await db.select().from(sessions).where(eq(sessions.id, sid!)).get());
  if (!session?.impersonatorId) redirect("/admin");
  (await db.delete(sessions).where(eq(sessions.id, sid!)).run());
  await createSessionFor(session!.impersonatorId!);
  await audit(session!.impersonatorId!, null, "platform.impersonate.stop");
  redirect("/platform");
}

export function hashPassword(pw: string) { return bcrypt.hashSync(pw, 10); }

/* ─── invites ────────────────────────────────────────────────── */

export async function createInvite(input: {
  agencyId: string; email: string; role: Role; firstName?: string; lastName?: string; invitedBy: string;
}) {
  const token = randomBytes(24).toString("hex");
  const id = randomUUID();
  (await db.insert(invites).values({
    id, ...input,
    email: input.email.toLowerCase(),
    token,
    expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
  }).run());
  await audit(input.invitedBy, input.agencyId, "invite.create", { type: "invite", id }, { email: input.email, role: input.role });
  return { id, token };
}

export async function findInvite(token: string) {
  return (await db.select().from(invites).where(eq(invites.token, token)).get());
}

/* ─── password reset ─────────────────────────────────────────── */

export async function createPasswordReset(userId: string) {
  const token = randomBytes(24).toString("hex");
  (await db.insert(passwordResets).values({
    id: randomUUID(), userId, token,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  }).run());
  return token;
}

export async function findPasswordReset(token: string) {
  return (await db.select().from(passwordResets).where(eq(passwordResets.token, token)).get());
}

/* ─── email verification ─────────────────────────────────────── */

export async function createEmailVerification(userId: string) {
  const token = randomBytes(20).toString("hex");
  (await db.insert(emailVerifications).values({
    id: randomUUID(), userId, token,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  }).run());
  return token;
}

/* ─── TOTP (RFC 6238, SHA-1, 30s, 6 digits) ──────────────────── */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = "", out = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  s = s.replace(/=+$/g, "").toUpperCase().replace(/\s+/g, "");
  let bits = "";
  for (const c of s) {
    const v = B32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpAt(secret: string, when = Date.now()): string {
  const counter = Math.floor(when / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset + 1] & 0xff) << 16 |
                (hmac[offset + 2] & 0xff) << 8  | (hmac[offset + 3] & 0xff)) % 1_000_000;
  return code.toString().padStart(6, "0");
}

export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const t = token.replace(/\D/g, "");
  if (t.length !== 6) return false;
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    if (totpAt(secret, now + i * 30_000) === t) return true;
  }
  return false;
}

export function totpAuthUrl(secret: string, account: string, issuer = "ShiftCare") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
