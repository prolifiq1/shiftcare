import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, EmptyState, Card, Avatar, Chip, Tabs } from "@/lib/ui";

const ACTION_GROUP: Record<string, "shift" | "booking" | "timesheet" | "import" | "auth" | "system"> = {
  "shift.create": "shift",
  "shift.publish": "shift",
  "shift.cancel": "shift",
  "booking.approve": "booking",
  "booking.reject": "booking",
  "timesheet.approve": "timesheet",
  "timesheet.dispute": "timesheet",
  "timesheet.submit": "timesheet",
  "import.upload": "import",
  "import.publish": "import",
  "importTemplate.create": "import",
  "invite.create": "auth",
  "mfa.enable": "auth",
  "mfa.disable": "auth",
};

const GROUP_TONE: Record<string, string> = {
  shift: "var(--brand-500)",
  booking: "var(--status-info-fg)",
  timesheet: "var(--status-ok-fg)",
  import: "var(--status-warn-fg)",
  auth: "var(--text-secondary)",
  system: "var(--text-muted)",
};

export default async function ActivityLog({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab || "all";

  const all = (await db
    .select({ a: auditLogs, u: users })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(eq(auditLogs.agencyId, user.agencyId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(500)
    .all());

  const filterFn = (g: string) => (r: (typeof all)[number]) => (ACTION_GROUP[r.a.action] ?? "system") === g;
  const counts = {
    shift: all.filter(filterFn("shift")).length,
    booking: all.filter(filterFn("booking")).length,
    timesheet: all.filter(filterFn("timesheet")).length,
    import: all.filter(filterFn("import")).length,
    auth: all.filter(filterFn("auth")).length,
  };

  const rows = tab === "all" ? all : all.filter(filterFn(tab));

  return (
    <>
      <PageHeader title="Activity log" subtitle={`Last ${all.length} events across the agency.`} />
      <div className="px-8 pt-4">
        <Tabs
          current={tab}
          tabs={[
            { key: "all", label: "All", href: "/admin/activity?tab=all", count: all.length },
            { key: "shift", label: "Shifts", href: "/admin/activity?tab=shift", count: counts.shift },
            { key: "booking", label: "Bookings", href: "/admin/activity?tab=booking", count: counts.booking },
            { key: "timesheet", label: "Timesheets", href: "/admin/activity?tab=timesheet", count: counts.timesheet },
            { key: "import", label: "Imports", href: "/admin/activity?tab=import", count: counts.import },
            { key: "auth", label: "Auth", href: "/admin/activity?tab=auth", count: counts.auth },
          ]}
        />
      </div>

      <div className="p-8">
        {rows.length === 0 ? (
          <EmptyState title="Nothing logged yet" body="Once people start working in the agency, every action shows up here." />
        ) : (
          <Card padded={false}>
            <ul>
              {rows.map(({ a, u }) => {
                const group = ACTION_GROUP[a.action] ?? "system";
                const tone = GROUP_TONE[group];
                let meta: Record<string, unknown> | null = null;
                try {
                  meta = a.meta ? JSON.parse(a.meta) : null;
                } catch {}
                return (
                  <li
                    key={a.id}
                    className="px-5 py-3 flex items-start gap-4 last:border-0"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <span
                      className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                      style={{ background: tone }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={u ? `${u.firstName} ${u.lastName}` : "—"} className="w-6 h-6 text-[10px]" />
                          <span className="text-sm font-medium">{u ? `${u.firstName} ${u.lastName}` : "System"}</span>
                          <Chip>{a.action}</Chip>
                          {a.targetType && (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              · {a.targetType}
                            </span>
                          )}
                        </div>
                        <div className="text-xs h-num shrink-0" style={{ color: "var(--text-muted)" }}>
                          {a.createdAt?.toISOString().slice(0, 16).replace("T", " ")}
                        </div>
                      </div>
                      {meta && Object.keys(meta).length > 0 && (
                        <pre className="text-[11px] mt-1 h-num whitespace-pre-wrap break-all" style={{ color: "var(--text-muted)" }}>
                          {JSON.stringify(meta)}
                        </pre>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
