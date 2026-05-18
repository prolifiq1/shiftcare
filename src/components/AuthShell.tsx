"use client";
import { SignIn, SignUp } from "@clerk/nextjs";

// Theme only via supported variables — overriding Clerk's internal element
// classes breaks its layout across versions, so we don't.
const appearance = {
  variables: {
    colorPrimary: "#0f6e6e",
    borderRadius: "8px",
    fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
  },
};

const signInLocalization = {
  signIn: {
    start: {
      title: "Sign in to ShiftCare",
      subtitle: "Welcome back — sign in to continue.",
    },
  },
};

const signUpLocalization = {
  signUp: {
    start: {
      title: "Create your ShiftCare account",
      subtitle: "Use the email your agency invited.",
    },
  },
};

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
    <div
      className="min-h-screen grid lg:grid-cols-2"
      style={{ background: "var(--bg-page)" }}
    >
      <div className="flex items-center justify-center p-6 sm:p-10">
        {mode === "sign-in" ? (
          <SignIn
            appearance={appearance}
            localization={signInLocalization}
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/post-login"
          />
        ) : (
          <SignUp
            appearance={appearance}
            localization={signUpLocalization}
            signInUrl="/login"
            fallbackRedirectUrl="/post-login"
          />
        )}
      </div>
      <Aside />
    </div>
  );
}
