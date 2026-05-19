"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--bg-page)" }}>
      <div className="h-card text-center" style={{ maxWidth: 420, padding: "2rem" }}>
        <div className="h-9 w-9 rounded-lg mx-auto mb-4" style={{ background: "var(--brand-500)" }} />
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          An unexpected error occurred. Please try again — if it keeps happening,
          contact your administrator.
        </p>
        <button onClick={() => reset()} className="h-btn h-btn-primary mt-5">
          Try again
        </button>
      </div>
    </div>
  );
}
