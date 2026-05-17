import { db } from "@/lib/db";
import { auditLogs, users, agencies } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader, EmptyState, Card, Avatar, Chip } from "@/lib/ui";

export default async function GlobalActivity() {
  await requireSuperAdmin();
  const rows = (await db
    .select({ a: auditLogs, u: users, ag: agencies })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .leftJoin(agencies, eq(agencies.id, auditLogs.agencyId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(500)
    .all());

  return (
    <>
      <PageHeader title="Global activity" subtitle={`Last ${rows.length} events across every tenant.`} />
      <div className="p-8">
        {rows.length === 0 ? (
          <EmptyState title="Nothing logged yet" body="Cross-tenant actions will stream here." />
        ) : (
          <Card padded={false}>
            <ul>
              {rows.map(({ a, u, ag }) => {
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
                    <Avatar name={u ? `${u.firstName} ${u.lastName}` : "—"} className="w-6 h-6 text-[10px] mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{u ? `${u.firstName} ${u.lastName}` : "System"}</span>
                          <Chip>{a.action}</Chip>
                          {ag && (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              · {ag.name}
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
