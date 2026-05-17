import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { invites, users, workers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSessionFor, findInvite, audit, logAuth } from "@/lib/auth";
import { Button, Field, Banner } from "@/lib/ui";

async function acceptAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token"));
  const password = String(formData.get("password") || "");
  const firstName = String(formData.get("firstName") || "");
  const lastName = String(formData.get("lastName") || "");
  if (password.length < 8) redirect(`/invite/${token}?error=` + encodeURIComponent("Password must be at least 8 characters."));
  const inv = await findInvite(token);
  if (!inv || inv.acceptedAt || inv.expiresAt.getTime() < Date.now()) {
    redirect(`/invite/${token}?error=` + encodeURIComponent("This invite is invalid or has expired."));
  }
  const existing = (await db.select().from(users).where(eq(users.email, inv.email)).get());
  if (existing) redirect(`/invite/${token}?error=` + encodeURIComponent("Account already exists — sign in instead."));

  const userId = randomUUID();
  (await db.insert(users).values({
    id: userId, agencyId: inv.agencyId, email: inv.email,
    passwordHash: hashPassword(password),
    firstName: firstName || inv.firstName || "",
    lastName:  lastName  || inv.lastName  || "",
    role: inv.role, status: "ACTIVE",
    emailVerifiedAt: new Date(),
  }).run());

  if (inv.role === "WORKER") {
    (await db.insert(workers).values({
      id: userId, agencyId: inv.agencyId, workerTypes: '["SUPPORT_WORKER"]',
      complianceStatus: "INCOMPLETE", onboardingStatus: "PROFILE_INCOMPLETE",
    }).run());
  }

  (await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inv.id)).run());
  await audit(userId, inv.agencyId, "invite.accept", { type: "user", id: userId }, { email: inv.email, role: inv.role });
  await logAuth("INVITE_ACCEPT", { userId, email: inv.email });
  await createSessionFor(userId);
  redirect(inv.role === "WORKER" ? "/worker" : "/admin");
}

export default async function InviteAcceptPage({
  params, searchParams,
}: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const inv = await findInvite(token);
  const invalid = !inv || inv.acceptedAt || inv.expiresAt.getTime() < Date.now();

  return (
    <div className="h-auth-shell">
      <div className="flex items-center justify-center p-8">
        <div className="h-auth-card">
          <div className="mb-6 flex items-center gap-2">
            <div className="h-8 w-8 rounded-md" style={{ background: "var(--brand-500)" }} />
            <div className="font-semibold text-lg">ShiftCare</div>
          </div>
          <h1 className="text-xl font-semibold mb-1">Accept your invitation</h1>
          {invalid ? (
            <Banner tone="danger" title="Invalid or expired invite">Please ask your admin to send a new one.</Banner>
          ) : (
            <>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                You’ve been invited as <b>{inv!.role.replace(/_/g, " ")}</b>. Set a password to continue.
              </p>
              {sp.error && <div className="mb-4"><Banner tone="danger">{sp.error}</Banner></div>}
              <form action={acceptAction} className="space-y-4">
                <input type="hidden" name="token" value={token} />
                <Field label="Email" type="email" value={inv!.email} disabled />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" name="firstName" defaultValue={inv!.firstName || ""} required />
                  <Field label="Last name" name="lastName" defaultValue={inv!.lastName || ""} required />
                </div>
                <Field label="Password" type="password" name="password" required minLength={8} autoComplete="new-password" />
                <Button type="submit" block size="lg">Accept & continue</Button>
              </form>
            </>
          )}
        </div>
      </div>
      <aside className="h-auth-aside" />
    </div>
  );
}
