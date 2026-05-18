"use client";
import { SignIn, SignUp } from "@clerk/nextjs";

const appearance = {
  variables: {
    colorPrimary: "#0f6e6e",
    colorText: "#0f1b1b",
    colorTextSecondary: "#5b6b6b",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    borderRadius: "10px",
    fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
  },
  elements: {
    rootBox: { width: "100%" },
    card: { boxShadow: "none", border: "none", padding: 0, width: "100%" },
    header: { display: "none" },
    footer: { background: "transparent" },
    socialButtonsBlockButton: {
      borderColor: "var(--border-strong)",
      "&:hover": { background: "var(--base-02)" },
    },
    formButtonPrimary: {
      background: "var(--brand-500)",
      fontSize: "14px",
      textTransform: "none",
      "&:hover": { background: "var(--brand-600)" },
    },
    formFieldInput: { borderColor: "var(--border-strong)" },
  },
};

function Brand() {
  return (
    <div className="mb-7">
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-lg" style={{ background: "var(--brand-500)" }} />
        <div className="text-xl font-semibold tracking-tight">ShiftCare</div>
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
      <div className="text-sm font-medium opacity-80">ShiftCare</div>
      <div>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight">
          Care &amp; support workforce, scheduled in minutes.
        </h2>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: "#bfe6df" }}>
          Publish shifts, fill them from a compliant worker pool, capture
          timesheets, and stay audit-ready — one platform for your whole agency.
        </p>
        <div className="mt-8 flex gap-8">
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
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]" style={{ background: "var(--bg-canvas)" }}>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full" style={{ maxWidth: 380 }}>
          <Brand />
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "sign-in" ? "Sign in to ShiftCare" : "Create your ShiftCare account"}
          </h1>
          <p className="text-sm mt-1 mb-6" style={{ color: "var(--text-muted)" }}>
            {mode === "sign-in"
              ? "Welcome back — sign in to continue."
              : "Use the email your agency invited."}
          </p>
          {mode === "sign-in" ? (
            <SignIn
              appearance={appearance}
              signUpUrl="/sign-up"
              fallbackRedirectUrl="/post-login"
            />
          ) : (
            <SignUp
              appearance={appearance}
              signInUrl="/login"
              fallbackRedirectUrl="/post-login"
            />
          )}
        </div>
      </div>
      <Aside />
    </div>
  );
}
