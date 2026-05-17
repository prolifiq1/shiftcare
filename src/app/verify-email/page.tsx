import { db } from "@/lib/db";
import { emailVerifications, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Banner, LinkButton } from "@/lib/ui";

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string; new?: string }> }) {
  const sp = await searchParams;
  let ok: "VERIFIED" | "ALREADY" | "INVALID" | null = null;
  if (sp.token) {
    const rec = db.select().from(emailVerifications).where(eq(emailVerifications.token, sp.token)).get();
    if (rec && !rec.usedAt && rec.expiresAt.getTime() > Date.now()) {
      db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, rec.userId)).run();
      db.update(emailVerifications).set({ usedAt: new Date() }).where(eq(emailVerifications.id, rec.id)).run();
      ok = "VERIFIED";
    } else if (rec?.usedAt) ok = "ALREADY";
    else ok = "INVALID";
  }

  return (
    <div className="h-auth-shell">
      <div className="flex items-center justify-center p-8">
        <div className="h-auth-card">
          <h1 className="text-xl font-semibold mb-2">Verify your email</h1>
          {!sp.token && <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Open the email we just sent and click the confirmation link.</p>}
          {sp.new && !ok && (
            <Banner tone="info" title="Welcome to ShiftCare">
              We’ve sent a verification email. In dev, open the admin dashboard to continue — the token is included in the URL when you signed up.
            </Banner>
          )}
          {ok === "VERIFIED" && <Banner tone="ok" title="Email verified">You’re all set.</Banner>}
          {ok === "ALREADY" && <Banner tone="info" title="Already verified">Your email was previously confirmed.</Banner>}
          {ok === "INVALID" && <Banner tone="danger" title="Invalid or expired link">Request a new one from your account settings.</Banner>}
          <div className="mt-6 flex gap-2">
            <LinkButton href="/admin" variant="primary">Continue</LinkButton>
            <Link className="h-btn h-btn-ghost" href="/login">Back to login</Link>
          </div>
        </div>
      </div>
      <aside className="h-auth-aside" />
    </div>
  );
}
