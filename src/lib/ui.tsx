/* Hydrogen component library — typed primitives backed by globals.css */
import React from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  block,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean }) {
  const cls = [
    "h-btn h-focus",
    `h-btn-${variant}`,
    size === "sm" && "h-btn-sm",
    size === "lg" && "h-btn-lg",
    block && "h-btn-block",
    className,
  ].filter(Boolean).join(" ");
  return <button className={cls} {...props}>{children}</button>;
}

export function LinkButton({
  href, variant = "primary", size = "md", block, className = "", children,
}: { href: string; variant?: Variant; size?: Size; block?: boolean; className?: string; children: React.ReactNode }) {
  const cls = [
    "h-btn h-focus",
    `h-btn-${variant}`,
    size === "sm" && "h-btn-sm",
    size === "lg" && "h-btn-lg",
    block && "h-btn-block",
    className,
  ].filter(Boolean).join(" ");
  return <Link href={href} className={cls}>{children}</Link>;
}

export function Field({
  label, hint, error, id, className = "", ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) {
  const inputId = id || `f-${React.useId()}`;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="h-label">{label}</label>}
      <input id={inputId} className="h-field h-focus" {...props} />
      {error ? <div className="h-error">{error}</div> : hint ? <div className="h-help">{hint}</div> : null}
    </div>
  );
}

export function Textarea({
  label, hint, error, id, className = "", ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; error?: string }) {
  const inputId = id || `t-${React.useId()}`;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="h-label">{label}</label>}
      <textarea id={inputId} className="h-field h-field-textarea h-focus" {...props} />
      {error ? <div className="h-error">{error}</div> : hint ? <div className="h-help">{hint}</div> : null}
    </div>
  );
}

export function Select({
  label, hint, error, id, className = "", children, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; error?: string }) {
  const inputId = id || `s-${React.useId()}`;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="h-label">{label}</label>}
      <select id={inputId} className="h-field h-focus" {...props}>{children}</select>
      {error ? <div className="h-error">{error}</div> : hint ? <div className="h-help">{hint}</div> : null}
    </div>
  );
}

export function Card({
  title, subtitle, action, children, padded = true, className = "", hover = false,
}: {
  title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode;
  children: React.ReactNode; padded?: boolean; className?: string; hover?: boolean;
}) {
  return (
    <div className={`h-card ${hover ? "h-card-hover" : ""} ${className}`}>
      {(title || action) && (
        <div className="px-5 py-4 border-b border-[color:var(--border-subtle)] flex items-start justify-between gap-3">
          <div>
            {title && <div className="font-semibold text-[15px]" style={{ color: "var(--text-primary)" }}>{title}</div>}
            {subtitle && <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </div>
  );
}

export function Stat({
  label, value, hint, delta,
}: { label: string; value: string | number; hint?: string; delta?: { value: string; positive?: boolean } }) {
  return (
    <div className="h-stat">
      <div className="h-stat-label">{label}</div>
      <div className="h-stat-value">{value}</div>
      {(hint || delta) && (
        <div className="h-stat-delta">
          {delta && (
            <span style={{ color: delta.positive ? "var(--status-ok-fg)" : "var(--status-danger-fg)" }}>
              {delta.positive ? "▲" : "▼"} {delta.value}
            </span>
          )}
          {hint && <span style={{ color: "var(--text-muted)" }}>{hint}</span>}
        </div>
      )}
    </div>
  );
}

/* Status pill — semantic mapping */
const PILL_MAP: Record<string, { tone: "ok"|"warn"|"danger"|"info"|"neutral"|"brand"; label?: string }> = {
  // Shift
  DRAFT: { tone: "neutral" },
  IMPORTED: { tone: "neutral" },
  VALIDATED: { tone: "info" },
  PUBLISHED: { tone: "brand" },
  PARTIALLY_FILLED: { tone: "warn" },
  FILLED: { tone: "ok" },
  IN_PROGRESS: { tone: "info" },
  COMPLETED: { tone: "neutral" },
  EXPIRED_UNFILLED: { tone: "danger" },
  CANCELLED: { tone: "danger" },
  CANCELLED_BY_CLIENT: { tone: "danger" },
  CANCELLED_BY_AGENCY: { tone: "danger" },
  // Booking
  REQUESTED: { tone: "warn" },
  APPROVED: { tone: "ok" },
  ASSIGNED: { tone: "ok" },
  CONFIRMED: { tone: "ok" },
  REJECTED: { tone: "danger" },
  CHECKED_IN: { tone: "info" },
  CHECKED_OUT: { tone: "brand" },
  TIMESHEET_SUBMITTED: { tone: "info" },
  TIMESHEET_APPROVED: { tone: "ok" },
  PAID: { tone: "ok" },
  NO_SHOW: { tone: "danger" },
  DISPUTED: { tone: "warn" },
  // Import
  VALID: { tone: "ok" },
  WARNING: { tone: "warn" },
  FAILED: { tone: "danger" },
  REVIEW: { tone: "info" },
  PUBLISHED_BATCH: { tone: "ok", label: "PUBLISHED" },
};

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const m = PILL_MAP[status] || { tone: "neutral" as const };
  return (
    <span className={`h-pill h-pill-${m.tone} ${className}`}>
      {(m.label || status).replace(/_/g, " ")}
    </span>
  );
}

/* Backwards compat */
export const StatusBadge = StatusPill;

export function Chip({ children, dotColor }: { children: React.ReactNode; dotColor?: string }) {
  return (
    <span className="h-chip">
      {dotColor && <span className="h-chip-dot" style={{ background: dotColor }} />}
      {children}
    </span>
  );
}

export function Banner({
  tone = "info", title, children, action,
}: { tone?: "info" | "ok" | "warn" | "danger"; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={`h-banner h-banner-${tone}`}>
      <div className="flex-1">
        {title && <div className="font-semibold mb-1">{title}</div>}
        {children && <div style={{ color: "var(--text-secondary)" }}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title, subtitle, breadcrumb, action,
}: { title: React.ReactNode; subtitle?: React.ReactNode; breadcrumb?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-8 py-6 border-b" style={{ background: "var(--bg-canvas)", borderColor: "var(--border-subtle)" }}>
      {breadcrumb && <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{breadcrumb}</div>}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>{title}</h1>
          {subtitle && <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{subtitle}</div>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon, title, body, action,
}: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="h-empty">
      {icon && <div className="text-3xl">{icon}</div>}
      <div className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>{title}</div>
      {body && <div className="text-sm max-w-md">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  const initials = name.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  return <span className={`h-avatar ${className}`}>{initials}</span>;
}

export function Tabs({
  tabs, current,
}: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <div className="border-b flex gap-1" style={{ borderColor: "var(--border-subtle)" }}>
      {tabs.map(t => {
        const active = t.key === current;
        return (
          <Link key={t.key} href={t.href} className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors`}
            style={{
              color: active ? "var(--brand-600)" : "var(--text-secondary)",
              borderColor: active ? "var(--brand-500)" : "transparent",
            }}>
            {t.label}{typeof t.count === "number" && <span className="ml-1.5 text-xs" style={{ color: "var(--text-muted)" }}>{t.count}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b"
      style={{ background: "var(--bg-canvas)", borderColor: "var(--border-subtle)" }}>
      {children}
    </div>
  );
}

export function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="h-table">{children}</table>
      </div>
    </div>
  );
}

/* Section block (for forms / settings) */
export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid md:grid-cols-3 gap-6 py-6 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="md:col-span-1">
        <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{title}</div>
        {description && <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{description}</div>}
      </div>
      <div className="md:col-span-2 space-y-4">{children}</div>
    </div>
  );
}

/* Money / time formatters */
export function Money({ amount, currency = "£" }: { amount?: number | null; currency?: string }) {
  if (amount == null) return <span className="h-num">—</span>;
  return <span className="h-num">{currency}{amount.toFixed(2)}</span>;
}

export function MoneyHourly({ amount }: { amount?: number | null }) {
  if (amount == null) return <span className="h-num">—</span>;
  return <span className="h-num">£{amount.toFixed(2)}/hr</span>;
}

/* Inline meta dot separator */
export function Meta({ items }: { items: (React.ReactNode | null | undefined | false)[] }) {
  const filtered = items.filter(Boolean);
  return (
    <div className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: "var(--text-muted)" }}>
      {filtered.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden>·</span>}
          <span>{it}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
