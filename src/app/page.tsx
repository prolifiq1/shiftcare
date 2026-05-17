import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LinkButton } from "@/lib/ui";

export default async function Home() {
  const s = await getSession();
  if (s) {
    if (s.role === "WORKER") redirect("/worker");
    redirect("/admin");
  }
  return (
    <main>
      <header className="flex items-center justify-between px-8 py-5 border-b"
        style={{ background: "var(--bg-canvas)", borderColor: "var(--border-subtle)" }}>
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md" style={{ background: "var(--brand-500)" }} />
          <div className="font-semibold text-lg">ShiftCare</div>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="h-btn h-btn-ghost">Sign in</Link>
          <Link href="/signup" className="h-btn h-btn-primary">Start free trial</Link>
        </div>
      </header>
      <section className="max-w-5xl mx-auto px-8 py-24">
        <div className="h-chip mb-6">
          <span className="h-chip-dot" style={{ background: "var(--brand-500)" }} />
          Premium care workforce operations
        </div>
        <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight max-w-3xl" style={{ letterSpacing: "-0.025em" }}>
          Care-sector shift operations, built for the way rotas actually arrive.
        </h1>
        <p className="mt-6 text-lg max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Upload the spreadsheets your clients send. ShiftCare normalises them into compliant shifts,
          publishes them to eligible workers, and carries each shift through attendance, timesheets, and pay —
          without the usual chaos.
        </p>
        <div className="mt-8 flex gap-3">
          <LinkButton href="/signup" size="lg">Start free trial</LinkButton>
          <LinkButton href="/login" variant="secondary" size="lg">Sign in</LinkButton>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-card p-5">
            <div className="h-pill h-pill-brand mb-3">Import engine</div>
            <div className="font-semibold mb-1">Messy sheets welcome</div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Auto-maps columns, normalises vocab (SW → Support Worker; Sleep → Sleep-in), handles overnights and merged headers. Save per-client templates.
            </div>
          </div>
          <div className="h-card p-5">
            <div className="h-pill h-pill-brand mb-3">Marketplace</div>
            <div className="font-semibold mb-1">Compliance-gated picking</div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Workers see only shifts they’re eligible for, with travel, pay, and explanation. Fair ranking, fast fulfilment.
            </div>
          </div>
          <div className="h-card p-5">
            <div className="h-pill h-pill-brand mb-3">Full lifecycle</div>
            <div className="font-semibold mb-1">From shift to pay</div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Attendance, timesheets, approvals, invoicing, payroll exports — the operational workflow in one platform.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
