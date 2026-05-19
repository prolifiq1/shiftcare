import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { db } from "./db";
import { users, workers, invites, notifications, auditLogs } from "./schema";
import { eq } from "drizzle-orm";
import { randomUUID, randomBytes } from "crypto";
import { redirect } from "next/navigation";

/*
 * Authentication is delegated to Clerk (passwords, MFA, sessions, email
 * verification, password reset). Authorization remains ours: every Clerk
 * identity is linked to a local `users` row that holds the agency scoping
 * and role. Multi-tenant isolation and impersonation stay in this codebase.
 */

const IMPERSONATE_COOKIE = "sc_impersonate"; // value = impersonated local user id

export type Role =
  | "SUPER_ADMIN" | "AGENCY_ADMIN" | "COORDINATOR" | "COMPLIANCE"
  | "FINANCE" | "WORKER" | "CLIENT";

export type SessionUser = {
  id: string; agencyId: string; email: string;
  firstName: string; lastName: string; role: Role;
  emailVerified: boolean; mfaEnabled: boolean;
  avatarDocId?: string | null;
  impersonatorId?: string | null;
};

type LocalUser = typeof users.$inferSelect;

/* ─── audit + notifications (unchanged domain helpers) ───────── */

export async function audit(
  actorId: string | null, agencyId: string | null, action: string,
  target?: { type: string; id: string }, meta?: object,
) {
  await db.insert(auditLogs).values({
    id: randomUUID(),
    actorId, agencyId, action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    meta: meta ? JSON.stringify(meta) : null,
  }).run();
}

export async function notify(userId: string, n: { type: string; title: string; body?: string; href?: string }) {
  await db.insert(notifications).values({ id: randomUUID(), userId, ...n }).run();
}

/* ─── Clerk identity → local user linkage ────────────────────── */

async function resolveLocalUser(): Promise<LocalUser | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const byClerk = await db.select().from(users).where(eq(users.clerkId, clerkId)).get();
  if (byClerk) return byClerk;

  // First sign-in for this Clerk identity — link or provision the local row.
  const cu = await currentUser();
  const email = (
    cu?.primaryEmailAddress?.emailAddress ??
    cu?.emailAddresses?.[0]?.emailAddress ??
    ""
  ).toLowerCase();
  if (!email) return null;

  const byEmail = await db.select().from(users).where(eq(users.email, email)).get();
  if (byEmail) {
    await db.update(users).set({ clerkId }).where(eq(users.id, byEmail.id)).run();
    return { ...byEmail, clerkId };
  }

  // Accept a pending invite, provisioning the tenant-scoped user.
  const inv = await db.select().from(invites).where(eq(invites.email, email)).get();
  if (inv && !inv.acceptedAt && inv.expiresAt.getTime() > Date.now()) {
    const id = randomUUID();
    await db.insert(users).values({
      id, agencyId: inv.agencyId, email, clerkId,
      firstName: cu?.firstName ?? inv.firstName ?? "New",
      lastName: cu?.lastName ?? inv.lastName ?? "User",
      role: inv.role, status: "ACTIVE", emailVerifiedAt: new Date(),
    }).run();
    if (inv.role === "WORKER") {
      await db.insert(workers).values({
        id, agencyId: inv.agencyId, onboardingStatus: "PROFILE_INCOMPLETE",
      }).run();
    }
    await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inv.id)).run();
    await audit(id, inv.agencyId, "invite.accept", { type: "invite", id: inv.id });
    return (await db.select().from(users).where(eq(users.id, id)).get()) ?? null;
  }

  return null;
}

/* ─── sessions / guards ──────────────────────────────────────── */

function toSessionUser(u: LocalUser, impersonatorId: string | null): SessionUser {
  return {
    id: u.id, agencyId: u.agencyId, email: u.email,
    firstName: u.firstName, lastName: u.lastName, role: u.role as Role,
    emailVerified: !!u.emailVerifiedAt, mfaEnabled: false,
    avatarDocId: u.avatarDocId ?? null,
    impersonatorId,
  };
}

export async function getSession(): Promise<SessionUser | null> {
  const u = await resolveLocalUser();
  if (!u) return null;
  if (u.status === "SUSPENDED" || u.status === "INACTIVE") return null;

  // Super-admins may be impersonating an agency user.
  if (u.role === "SUPER_ADMIN") {
    const targetId = (await cookies()).get(IMPERSONATE_COOKIE)?.value;
    if (targetId) {
      const t = await db.select().from(users).where(eq(users.id, targetId)).get();
      if (t) return toSessionUser(t, u.id);
    }
  }
  return toSessionUser(u, null);
}

export async function getRealUser(): Promise<SessionUser | null> {
  const u = await resolveLocalUser();
  if (!u || u.status === "SUSPENDED" || u.status === "INACTIVE") return null;
  return toSessionUser(u, null);
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
  const real = await getRealUser();
  if (!real || real.role !== "SUPER_ADMIN") redirect("/login");
  return real;
}

/* ─── impersonation (super-admin → agency admin) ─────────────── */

export async function startImpersonation(agencyId: string) {
  const su = await requireSuperAdmin();
  const target = (await db.select().from(users).where(eq(users.agencyId, agencyId)).all())
    .find((u) => u.role === "AGENCY_ADMIN" && u.status === "ACTIVE");
  if (!target) redirect("/platform?error=no_admin");
  (await cookies()).set(IMPERSONATE_COOKIE, target!.id, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 4,
  });
  await audit(su.id, agencyId, "platform.impersonate.start", { type: "agency", id: agencyId });
  redirect("/admin");
}

export async function stopImpersonation() {
  const c = await cookies();
  const targetId = c.get(IMPERSONATE_COOKIE)?.value;
  c.delete(IMPERSONATE_COOKIE);
  const real = await getRealUser();
  if (real) await audit(real.id, null, "platform.impersonate.stop", targetId ? { type: "user", id: targetId } : undefined);
  redirect("/platform");
}

/* ─── invites (tenant-scoped, accepted on first Clerk sign-in) ── */

export async function createInvite(input: {
  agencyId: string; email: string; role: Role; firstName?: string; lastName?: string; invitedBy: string;
}) {
  const token = randomBytes(24).toString("hex");
  const id = randomUUID();
  await db.insert(invites).values({
    id, ...input,
    email: input.email.toLowerCase(),
    token,
    expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
  }).run();
  await audit(input.invitedBy, input.agencyId, "invite.create", { type: "invite", id }, { email: input.email, role: input.role });
  return { id, token };
}

export async function findInvite(token: string) {
  return db.select().from(invites).where(eq(invites.token, token)).get();
}
