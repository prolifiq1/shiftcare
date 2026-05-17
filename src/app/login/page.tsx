import { login, verifyMfaAndLogin, getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Button, Field, Banner } from "@/lib/ui";

async function routeByRole() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "SUPER_ADMIN") redirect("/platform");
  if (s.role === "WORKER") redirect("/worker");
  redirect("/admin");
}

async function bootstrap() {
  if (process.env.AUTO_SEED === "0") return;
  const { ensureSchema, ensureSeeded } = await import("@/lib/db");
  const { seedDatabase } = await import("@/lib/seed");
  await ensureSchema();
  await ensureSeeded(seedDatabase);
}

async function loginAction(formData: FormData) {
  "use server";
  await bootstrap();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const r = await login(email, password);
  if (!r.ok) {
    const map = {
      INVALID: "Incorrect email or password.",
      LOCKED: "Too many attempts. Try again in 15 minutes.",
      SUSPENDED: "This account is suspended. Contact your agency admin.",
      UNVERIFIED: "Please verify your email first.",
    } as const;
    redirect("/login?error=" + encodeURIComponent(map[r.reason]));
  }
  if (r.mfaRequired) redirect("/login");
  await routeByRole();
}

async function mfaAction(formData: FormData) {
  "use server";
  const code = String(formData.get("code") || "");
  const ok = await verifyMfaAndLogin(code);
  if (!ok) redirect("/login?error=" + encodeURIComponent("Incorrect code. Try again."));
  await routeByRole();
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const pending = (await cookies()).get("sc_pending_mfa")?.value;
  return (
    <div className="h-auth-shell">
      <div className="flex items-center justify-center p-8">
        <div className="h-auth-card">
          <div className="mb-6 flex items-center gap-2">
            <div className="h-8 w-8 rounded-md" style={{ background: "var(--brand-500)" }} />
            <div className="font-semibold text-lg" style={{ letterSpacing: "-0.01em" }}>ShiftCare</div>
          </div>
          {pending ? (
            <>
              <h1 className="text-xl font-semibold mb-1">Two-factor verification</h1>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Enter the 6-digit code from your authenticator app.</p>
              {sp.error && <div className="mb-4"><Banner tone="danger">{sp.error}</Banner></div>}
              <form action={mfaAction} className="space-y-4">
                <Field
                  name="code" inputMode="numeric" autoComplete="one-time-code"
                  pattern="[0-9]*" maxLength={6} required autoFocus
                  placeholder="123 456"
                  style={{ letterSpacing: "0.3em", textAlign: "center", fontSize: 18 }}
                />
                <Button type="submit" block size="lg">Verify</Button>
              </form>
              <div className="mt-6 text-xs text-center" style={{ color: "var(--text-muted)" }}>
                Lost your device? <a className="h-link" href="/help">Contact support</a>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold mb-1">Welcome back</h1>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Sign in to your ShiftCare workspace.</p>
              {sp.error && <div className="mb-4"><Banner tone="danger">{sp.error}</Banner></div>}
              <form action={loginAction} className="space-y-4">
                <Field label="Work email" type="email" name="email" required autoComplete="email" autoFocus />
                <Field label="Password" type="password" name="password" required autoComplete="current-password" />
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    <input type="checkbox" name="remember" defaultChecked /> Keep me signed in
                  </label>
                  <Link href="/forgot" className="h-link text-[13px]">Forgot password?</Link>
                </div>
                <Button type="submit" block size="lg">Sign in</Button>
              </form>
              <div className="mt-6 text-sm text-center" style={{ color: "var(--text-muted)" }}>
                New to ShiftCare? <Link className="h-link" href="/signup">Create an agency workspace</Link>
              </div>
              <div className="mt-4 text-xs text-center" style={{ color: "var(--text-muted)" }}>
                Demo · admin@sure.test / admin123 · jamie@sure.test / worker123
              </div>
            </>
          )}
        </div>
      </div>
      <aside className="h-auth-aside p-12 flex-col justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest opacity-70">ShiftCare</div>
          <div className="text-3xl font-semibold mt-4 leading-tight max-w-md" style={{ letterSpacing: "-0.02em" }}>
            Care-sector workforce operations, built for the way rotas actually arrive.
          </div>
          <div className="mt-4 opacity-80 text-sm max-w-md">
            Ingest messy spreadsheets, publish a compliant marketplace, and carry shifts through attendance, timesheets, and pay — without leaving the platform.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <div className="text-2xl font-semibold h-num">98%</div>
            <div className="opacity-70 mt-1">Fill rate on bank shifts</div>
          </div>
          <div>
            <div className="text-2xl font-semibold h-num">12×</div>
            <div className="opacity-70 mt-1">Faster rota ingestion</div>
          </div>
          <div>
            <div className="text-2xl font-semibold h-num">0</div>
            <div className="opacity-70 mt-1">Compliance exceptions at go-live</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
