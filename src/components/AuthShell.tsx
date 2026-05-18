"use client";
import { useState } from "react";
import { SignUp } from "@clerk/nextjs";
import { useSignIn } from "@clerk/nextjs/legacy";
import { useRouter } from "next/navigation";
import Link from "next/link";

const appearance = {
  variables: {
    colorPrimary: "#0f6e6e",
    borderRadius: "8px",
    fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
  },
};

function clerkErr(e: unknown): string {
  const x = e as { errors?: { longMessage?: string; message?: string }[] };
  return x?.errors?.[0]?.longMessage || x?.errors?.[0]?.message || "Something went wrong. Please try again.";
}

function SignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [emailAddressId, setEmailAddressId] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function finish(sessionId: string) {
    await setActive!({ session: sessionId });
    router.push("/post-login");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    setLoading(true);
    try {
      let res = await signIn.create({ identifier: email, password });
      if (res.status === "needs_first_factor") {
        res = await signIn.attemptFirstFactor({ strategy: "password", password });
      }
      if (res.status === "complete") {
        await finish(res.createdSessionId!);
        return;
      }
      if (res.status === "needs_second_factor") {
        const f = res.supportedSecondFactors?.find((s) => s.strategy === "email_code") as
          | { emailAddressId?: string }
          | undefined;
        await signIn.prepareSecondFactor({ strategy: "email_code", emailAddressId: f?.emailAddressId } as never);
        setEmailAddressId(f?.emailAddressId);
        setNeedCode(true);
      } else {
        setError("Couldn’t sign you in. Check your email and password.");
      }
    } catch (e) {
      setError(clerkErr(e));
    } finally {
      setLoading(false);
    }
  }

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    setLoading(true);
    try {
      const res = await signIn.attemptSecondFactor({ strategy: "email_code", code });
      if (res.status === "complete") {
        await finish(res.createdSessionId!);
      } else {
        setError("That code didn’t work. Try again.");
      }
    } catch (e) {
      setError(clerkErr(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full" style={{ maxWidth: 380 }}>
      <div className="flex items-center gap-2.5 mb-7">
        <div className="h-9 w-9 rounded-lg" style={{ background: "var(--brand-500)" }} />
        <div className="text-xl font-semibold tracking-tight">ShiftCare</div>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to ShiftCare</h1>
      <p className="text-sm mt-1 mb-6" style={{ color: "var(--text-muted)" }}>
        {needCode ? "Enter the verification code to continue." : "Welcome back — sign in to continue."}
      </p>

      {error && (
        <div
          className="mb-4 text-sm rounded-lg px-3 py-2.5"
          style={{
            background: "var(--status-danger-bg)",
            color: "var(--status-danger-fg)",
            border: "1px solid var(--status-danger-border)",
          }}
        >
          {error}
        </div>
      )}

      {!needCode ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="h-label" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              className="h-field h-focus"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@agency.co.uk"
            />
          </div>
          <div>
            <label className="h-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-field h-focus"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={loading || !isLoaded} className="h-btn h-btn-primary h-btn-block h-btn-lg">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form onSubmit={onCode} className="space-y-4">
          <div>
            <label className="h-label" htmlFor="code">Verification code</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="h-field h-focus h-num"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </div>
          <button type="submit" disabled={loading} className="h-btn h-btn-primary h-btn-block h-btn-lg">
            {loading ? "Verifying…" : "Verify & continue"}
          </button>
          <button
            type="button"
            className="h-btn h-btn-ghost h-btn-block"
            onClick={() => { setNeedCode(false); setCode(""); setError(""); }}
          >
            Back
          </button>
        </form>
      )}

      <div className="text-xs mt-6 text-center" style={{ color: "var(--text-muted)" }}>
        Don’t have an account?{" "}
        <Link href="/sign-up" className="h-link">Sign up</Link>
      </div>
    </div>
  );
}

function Aside() {
  return (
    <aside
      className="hidden lg:flex flex-col justify-between p-12"
      style={{ background: "var(--brand-700)", color: "#eafaf7" }}
    >
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg" style={{ background: "#eafaf7" }} />
        <span className="font-semibold tracking-tight">ShiftCare</span>
      </div>
      <div>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight">
          Care &amp; support workforce, scheduled in minutes.
        </h2>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: "#bfe6df" }}>
          Publish shifts, fill them from a compliant worker pool, capture
          timesheets, and stay audit-ready — one platform for your whole agency.
        </p>
        <div className="mt-8 flex gap-10">
          <div>
            <div className="text-2xl font-semibold h-num">98%</div>
            <div className="text-xs" style={{ color: "#bfe6df" }}>fill rate</div>
          </div>
          <div>
            <div className="text-2xl font-semibold h-num">12×</div>
            <div className="text-xs" style={{ color: "#bfe6df" }}>faster rota import</div>
          </div>
          <div>
            <div className="text-2xl font-semibold h-num">0</div>
            <div className="text-xs" style={{ color: "#bfe6df" }}>spreadsheets</div>
          </div>
        </div>
      </div>
      <div className="text-xs opacity-70">UK-first · GDPR-aware · multi-tenant</div>
    </aside>
  );
}

export function AuthShell({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: "var(--bg-canvas)" }}>
      <div className="flex items-center justify-center p-6 sm:p-10">
        {mode === "sign-in" ? (
          <SignInForm />
        ) : (
          <SignUp appearance={appearance} signInUrl="/login" fallbackRedirectUrl="/post-login" />
        )}
      </div>
      <Aside />
    </div>
  );
}
