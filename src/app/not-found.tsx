import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--bg-page)" }}>
      <div className="h-card text-center" style={{ maxWidth: 420, padding: "2rem" }}>
        <div className="h-9 w-9 rounded-lg mx-auto mb-4" style={{ background: "var(--brand-500)" }} />
        <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          The page you’re looking for doesn’t exist or you don’t have access to it.
        </p>
        <Link href="/" className="h-btn h-btn-primary mt-5 inline-flex">
          Back to start
        </Link>
      </div>
    </div>
  );
}
