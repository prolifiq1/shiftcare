import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { agencies, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSessionFor, createEmailVerification, audit, logAuth } from "@/lib/auth";
import { Button, Field, Banner } from "@/lib/ui";

async function signupAction(formData: FormData) {
  "use server";
  const agencyName = String(formData.get("agency") || "").trim();
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const consent = formData.get("consent");
  if (!agencyName || !firstName || !email || password.length < 8 || !consent) {
    redirect("/signup?error=" + encodeURIComponent("Please fill all fields and accept the terms. Password must be 8+ characters."));
  }
  const existing = (await db.select().from(users).where(eq(users.email, email)).get());
  if (existing) redirect("/signup?error=" + encodeURIComponent("An account with this email already exists."));

  const agencyId = randomUUID();
  (await db.insert(agencies).values({ id: agencyId, name: agencyName, slug: agencyName.toLowerCase().replace(/[^a-z0-9]+/g, "-") }).run());
  const userId = randomUUID();
  (await db.insert(users).values({
    id: userId, agencyId, email,
    passwordHash: hashPassword(password),
    firstName, lastName, role: "AGENCY_ADMIN", status: "ACTIVE",
  }).run());

  const token = await createEmailVerification(userId);
  await audit(userId, agencyId, "agency.create", { type: "agency", id: agencyId }, { name: agencyName });
  await logAuth("SIGNUP", { userId, email });
  await createSessionFor(userId);
  redirect(`/verify-email?token=${token}&new=1`);
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="h-auth-shell">
      <div className="flex items-center justify-center p-8">
        <div className="h-auth-card">
          <div className="mb-6 flex items-center gap-2">
            <div className="h-8 w-8 rounded-md" style={{ background: "var(--brand-500)" }} />
            <div className="font-semibold text-lg">ShiftCare</div>
          </div>
          <h1 className="text-xl font-semibold mb-1">Create your agency workspace</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>14-day trial. No card required.</p>
          {sp.error && <div className="mb-4"><Banner tone="danger">{sp.error}</Banner></div>}
          <form action={signupAction} className="space-y-4">
            <Field label="Agency name" name="agency" required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" name="firstName" required />
              <Field label="Last name" name="lastName" required />
            </div>
            <Field label="Work email" type="email" name="email" required autoComplete="email" />
            <Field label="Password" type="password" name="password" required minLength={8} hint="At least 8 characters." autoComplete="new-password" />
            <label className="flex items-start gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" name="consent" required className="mt-0.5" />
              <span>I agree to the <a className="h-link" href="/legal/terms">Terms</a> and <a className="h-link" href="/legal/privacy">Privacy Policy</a>.</span>
            </label>
            <Button type="submit" block size="lg">Create workspace</Button>
          </form>
          <div className="mt-6 text-sm text-center" style={{ color: "var(--text-muted)" }}>
            Already have an account? <Link className="h-link" href="/login">Sign in</Link>
          </div>
        </div>
      </div>
      <aside className="h-auth-aside p-12 flex-col justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest opacity-70">What you get</div>
          <ul className="mt-6 space-y-3 text-sm max-w-md">
            <li>✓ Spreadsheet import that normalises messy client rotas</li>
            <li>✓ Compliance-gated shift marketplace for your workers</li>
            <li>✓ Attendance, timesheets, and pay in one flow</li>
            <li>✓ Premium, accessible, operator-grade UX</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
