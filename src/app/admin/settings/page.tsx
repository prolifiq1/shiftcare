import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { requireSession, generateTotpSecret, totpAuthUrl, verifyTotp, audit } from "@/lib/auth";
import { PageHeader, Card, Field, Button, Banner } from "@/lib/ui";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

const PENDING = "sc_mfa_setup";

async function startMfa() {
  "use server";
  await requireSession();
  const secret = generateTotpSecret();
  const c = await cookies();
  c.set(PENDING, secret, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  redirect("/admin/settings");
}

async function confirmMfa(formData: FormData) {
  "use server";
  const user = await requireSession();
  const code = String(formData.get("code") || "");
  const c = await cookies();
  const secret = c.get(PENDING)?.value;
  if (!secret) redirect("/admin/settings?mfa=missing");
  if (!verifyTotp(secret!, code)) redirect("/admin/settings?mfa=bad");
  const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(5).toString("hex"));
  db.update(users)
    .set({ mfaEnabled: true, mfaSecret: secret, mfaRecoveryCodes: JSON.stringify(recoveryCodes) })
    .where(eq(users.id, user.id))
    .run();
  c.delete(PENDING);
  audit(user.id, user.agencyId, "mfa.enable");
  redirect("/admin/settings?mfa=ok");
}

async function disableMfa() {
  "use server";
  const user = await requireSession();
  db.update(users)
    .set({ mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: null })
    .where(eq(users.id, user.id))
    .run();
  audit(user.id, user.agencyId, "mfa.disable");
  redirect("/admin/settings?mfa=disabled");
}

async function cancelMfa() {
  "use server";
  await requireSession();
  const c = await cookies();
  c.delete(PENDING);
  redirect("/admin/settings");
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ mfa?: string }> }) {
  const sessionUser = await requireSession();
  const sp = await searchParams;
  const u = db.select().from(users).where(eq(users.id, sessionUser.id)).get();
  if (!u) redirect("/login");

  const c = await cookies();
  const pendingSecret = c.get(PENDING)?.value;
  const otpUrl = pendingSecret ? totpAuthUrl(pendingSecret, u!.email) : null;
  const qrSrc = otpUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpUrl)}`
    : null;

  return (
    <>
      <PageHeader title="Settings" subtitle="Account, security, and preferences." />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        <Card title="Account">
          <dl className="space-y-3 text-sm">
            <Row k="Name" v={`${u!.firstName} ${u!.lastName}`} />
            <Row k="Email" v={u!.email} />
            <Row k="Role" v={u!.role.replace(/_/g, " ")} />
            <Row k="Email verified" v={u!.emailVerifiedAt ? "Yes" : "Pending"} />
          </dl>
        </Card>

        <Card
          title="Two-factor authentication"
          subtitle={u!.mfaEnabled ? "Active on your account." : "Add a TOTP authenticator app to protect your account."}
        >
          {sp.mfa === "ok" && <Banner tone="ok" title="MFA enabled">Save your recovery codes somewhere safe.</Banner>}
          {sp.mfa === "disabled" && <Banner tone="warn" title="MFA disabled">You can re-enable it any time.</Banner>}
          {sp.mfa === "bad" && <Banner tone="danger" title="That code didn’t work">Try a fresh code from your app.</Banner>}
          {sp.mfa === "missing" && <Banner tone="danger" title="Setup expired">Start again.</Banner>}

          {u!.mfaEnabled ? (
            <div className="mt-4 space-y-3">
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                MFA has been verified on this account.
              </div>
              <form action={disableMfa}>
                <Button variant="danger" type="submit">Disable MFA</Button>
              </form>
            </div>
          ) : pendingSecret && qrSrc ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-4">
                <img src={qrSrc} alt="Scan with your authenticator" className="rounded-md" style={{ border: "1px solid var(--border-subtle)" }} />
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  <div className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>Or enter manually</div>
                  <code className="h-num text-[11px] break-all" style={{ background: "var(--base-03)", padding: "4px 6px", borderRadius: 4 }}>{pendingSecret}</code>
                </div>
              </div>
              <div className="flex gap-3 items-end">
                <form action={confirmMfa} className="flex-1 space-y-3">
                  <Field label="6-digit code" name="code" required maxLength={6} pattern="[0-9]{6}" inputMode="numeric" autoFocus />
                  <Button type="submit">Verify & enable</Button>
                </form>
                <form action={cancelMfa}><Button variant="ghost" type="submit">Cancel</Button></form>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <form action={startMfa}>
                <Button type="submit">Set up MFA</Button>
              </form>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b last:border-0 pb-2 last:pb-0" style={{ borderColor: "var(--border-subtle)" }}>
      <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
