import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { passwordResets, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { hashPassword, findPasswordReset, logAuth } from "@/lib/auth";
import { Button, Field, Banner } from "@/lib/ui";

async function resetAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token"));
  const password = String(formData.get("password") || "");
  if (password.length < 8) redirect(`/reset/${token}?error=` + encodeURIComponent("Password must be at least 8 characters."));
  const rec = await findPasswordReset(token);
  if (!rec || rec.usedAt || rec.expiresAt.getTime() < Date.now()) {
    redirect(`/reset/${token}?error=` + encodeURIComponent("This reset link is invalid or has expired."));
  }
  (await db.update(users).set({ passwordHash: hashPassword(password), failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, rec.userId)).run());
  (await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, rec.id)).run());
  await logAuth("PWD_RESET_OK", { userId: rec.userId });
  redirect("/login?error=" + encodeURIComponent("Password updated. Sign in with your new password."));
}

export default async function ResetPage({
  params, searchParams,
}: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const rec = await findPasswordReset(token);
  const invalid = !rec || rec.usedAt || rec.expiresAt.getTime() < Date.now();
  return (
    <div className="h-auth-shell">
      <div className="flex items-center justify-center p-8">
        <div className="h-auth-card">
          <h1 className="text-xl font-semibold mb-1">Set a new password</h1>
          {invalid ? (
            <Banner tone="danger" title="Invalid or expired link">Request a new reset from the <a className="h-link" href="/forgot">forgot password</a> page.</Banner>
          ) : (
            <>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Choose a password with at least 8 characters.</p>
              {sp.error && <div className="mb-4"><Banner tone="danger">{sp.error}</Banner></div>}
              <form action={resetAction} className="space-y-4">
                <input type="hidden" name="token" value={token} />
                <Field label="New password" type="password" name="password" required minLength={8} autoComplete="new-password" autoFocus />
                <Button type="submit" block size="lg">Update password</Button>
              </form>
            </>
          )}
        </div>
      </div>
      <aside className="h-auth-aside" />
    </div>
  );
}
