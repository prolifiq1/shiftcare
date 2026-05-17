import { db } from "@/lib/db";
import { workers, users, workerDocuments } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, Avatar, Chip, LinkButton } from "@/lib/ui";
import Link from "next/link";

type Tone = "ok" | "warn" | "danger" | "neutral";
function complianceTone(status: string | null, expiringSoon: boolean, expired: boolean): { tone: Tone; label: string } {
  if (expired || status === "EXPIRED") return { tone: "danger", label: "Expired" };
  if (expiringSoon || status === "AMBER") return { tone: "warn", label: "Expiring" };
  if (status === "COMPLIANT") return { tone: "ok", label: "Compliant" };
  return { tone: "neutral", label: status || "Pending" };
}

const TONE_BG: Record<Tone, string> = {
  ok: "var(--status-ok-bg)",
  warn: "var(--status-warn-bg)",
  danger: "var(--status-danger-bg)",
  neutral: "var(--base-03)",
};
const TONE_FG: Record<Tone, string> = {
  ok: "var(--status-ok-fg)",
  warn: "var(--status-warn-fg)",
  danger: "var(--status-danger-fg)",
  neutral: "var(--text-secondary)",
};

export default async function WorkersList() {
  const user = await requireAdmin();
  const rows = (await db
    .select({ w: workers, u: users })
    .from(workers)
    .leftJoin(users, eq(users.id, workers.id))
    .where(eq(workers.agencyId, user.agencyId))
    .all());

  const now = Date.now();
  const enriched = await Promise.all(
    rows.map(async ({ w, u }) => {
      const docs = await db
        .select()
        .from(workerDocuments)
        .where(eq(workerDocuments.workerId, w.id))
        .all();
      const expired = docs.some((d) => d.expiryDate && d.expiryDate.getTime() < now);
      const expiringSoon = docs.some((d) => {
        if (!d.expiryDate) return false;
        const days = (d.expiryDate.getTime() - now) / 86400000;
        return days >= 0 && days < 30;
      });
      return { w, u, docsCount: docs.length, c: complianceTone(w.complianceStatus, expiringSoon, expired) };
    }),
  );

  const compliantCount = rows.filter((r) => r.w.complianceStatus === "COMPLIANT").length;
  const reliabilityAvg = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r.w.reliabilityScore ?? 0), 0) / rows.length)
    : 0;

  return (
    <>
      <PageHeader
        title="Workers"
        subtitle={`${rows.length} workers · ${compliantCount} compliant · avg reliability ${reliabilityAvg}`}
        action={<LinkButton href="/admin/team">Invite worker</LinkButton>}
      />
      <div className="p-8">
        {rows.length === 0 ? (
          <EmptyState
            title="No workers yet"
            body="Invite workers to start filling shifts."
            action={<LinkButton href="/admin/team">Invite worker</LinkButton>}
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Postcode</th>
                <th>Worker types</th>
                <th>Compliance</th>
                <th>Docs</th>
                <th>Reliability</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {enriched.map(({ w, u, docsCount, c }) => {
                const types: string[] = JSON.parse(w.workerTypes || "[]");
                return (
                  <tr key={w.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={`${u?.firstName ?? ""} ${u?.lastName ?? ""}`} />
                        <div>
                          <div className="font-medium">{u?.firstName} {u?.lastName}</div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{u?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="h-num">{w.homePostcode}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {types.slice(0, 3).map((t) => (
                          <Chip key={t}>{t.replace(/_/g, " ")}</Chip>
                        ))}
                        {types.length > 3 && <Chip>+{types.length - 3}</Chip>}
                      </div>
                    </td>
                    <td>
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: TONE_BG[c.tone], color: TONE_FG[c.tone] }}
                      >
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full"
                          style={{ background: TONE_FG[c.tone] }}
                        />
                        {c.label}
                      </span>
                    </td>
                    <td className="h-num text-xs" style={{ color: "var(--text-muted)" }}>{docsCount}</td>
                    <td className="h-num">
                      <span
                        style={{
                          color:
                            (w.reliabilityScore ?? 0) >= 80
                              ? "var(--status-ok-fg)"
                              : (w.reliabilityScore ?? 0) >= 60
                              ? "var(--status-warn-fg)"
                              : "var(--status-danger-fg)",
                        }}
                      >
                        {w.reliabilityScore?.toFixed(0) ?? "—"}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link className="h-link text-xs" href={`/admin/workers/${w.id}`}>Open →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </div>
    </>
  );
}
