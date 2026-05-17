import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { createPasswordReset, logAuth } from "@/lib/auth";
import { Button, Field, Banner } from "@/lib/ui";

async function forgotAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const user = (await db.select().from(users).where(eq(users.email, email)).get());
  let token: string | null = null;
  if (user) {
    token = await createPasswordReset(user.id);
    await logAuth("PWD_RESET_REQ", { userId: user.id, email });
  }
  redirect(`/forgot?sent=1${token ? `&_t=${token}` : ""}`);
}

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ sent?: string; _t?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="h-auth-shell">
      <div className="flex items-center justify-center p-8">
        <div className="h-auth-card">
          <div className="mb-6 flex items-center gap-2">
            <div className="h-8 w-8 rounded-md" style={{ background: "var(--brand-500)" }} />
            <div className="font-semibold text-lg">ShiftCare</div>
          </div>
          <h1 className="text-xl font-semibold mb-1">Reset your password</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            We’ll email a reset link if this account exists.
          </p>
          {sp.sent ? (
            <Banner tone="ok" title="Check your inbox">
              If an account with that email exists, you’ll receive a reset link within a minute. The link expires in 30 minutes.
              {sp._t && (
                <div className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  Dev preview: <Link className="h-link" href={`/reset/${sp._t}`}>open reset link</Link>
                </div>
              )}
            </Banner>
          ) : (
            <form action={forgotAction} className="space-y-4">
              <Field label="Work email" type="email" name="email" required autoFocus autoComplete="email" />
              <Button type="submit" block size="lg">Send reset link</Button>
            </form>
          )}
          <div className="mt-6 text-sm text-center" style={{ color: "var(--text-muted)" }}>
            Remembered it? <Link className="h-link" href="/login">Back to sign in</Link>
          </div>
        </div>
      </div>
      <aside className="h-auth-aside" />
    </div>
  );
}
