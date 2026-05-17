import { db } from "@/lib/db";
import { shifts, locations, clients } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, StatusPill, LinkButton, DataTable, EmptyState, FilterBar } from "@/lib/ui";
import Link from "next/link";

const STATUSES = ["DRAFT", "PUBLISHED", "PARTIALLY_FILLED", "FILLED", "CANCELLED_BY_AGENCY", "COMPLETED"];

export default async function ShiftsList({ searchParams }: { searchParams: Promise<{ status?: string; client?: string; from?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const all = (await db.select({ s: shifts, l: locations, c: clients })
    .from(shifts)
    .leftJoin(locations, eq(locations.id, shifts.locationId))
    .leftJoin(clients, eq(clients.id, shifts.clientId))
    .where(eq(shifts.agencyId, user.agencyId))
    .orderBy(shifts.date, shifts.startTime)
    .all());

  const clientList = Array.from(new Map(all.filter((r) => r.c).map((r) => [r.c!.id, r.c!.name])).entries());
  const rows = all.filter((r) => {
    if (sp.status && r.s.status !== sp.status) return false;
    if (sp.client && r.c?.id !== sp.client) return false;
    if (sp.from && r.s.date < sp.from) return false;
    return true;
  });
  const isFiltered = !!(sp.status || sp.client || sp.from);

  return (
    <>
      <PageHeader
        title="Shifts" subtitle={`${rows.length} of ${all.length} shifts${isFiltered ? " · filtered" : ""}`}
        action={<>
          <LinkButton href="/admin/import" variant="secondary">Import</LinkButton>
          <LinkButton href="/admin/shifts/new">New shift</LinkButton>
        </>}
      />
      <div className="px-8 pt-4">
        <FilterBar>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div>
              <label className="h-label">Status</label>
              <select name="status" defaultValue={sp.status ?? ""} className="h-field h-focus" style={{ minWidth: 160 }}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="h-label">Client</label>
              <select name="client" defaultValue={sp.client ?? ""} className="h-field h-focus" style={{ minWidth: 180 }}>
                <option value="">All clients</option>
                {clientList.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="h-label">From date</label>
              <input type="date" name="from" defaultValue={sp.from ?? ""} className="h-field h-focus" />
            </div>
            <button type="submit" className="h-btn h-btn-secondary">Apply</button>
            {isFiltered && <a href="/admin/shifts" className="h-btn h-btn-ghost">Clear</a>}
          </form>
        </FilterBar>
      </div>
      <div className="p-8">
        {rows.length === 0 ? (
          <EmptyState title="No shifts yet" body="Import a rota or create a shift manually." action={<LinkButton href="/admin/import">Import rota</LinkButton>} />
        ) : (
          <DataTable>
            <thead><tr>
              <th>Date</th><th>Time</th><th>Type</th><th>Client / location</th><th>Worker type</th><th>Filled</th><th>Pay</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(({ s, l, c }) => (
                <tr key={s.id}>
                  <td className="h-num font-medium">{s.date}</td>
                  <td className="h-num">{s.startTime}–{s.endTime}{s.overnight && <span className="text-[10px] ml-1" style={{ color: "var(--text-muted)" }}>+1d</span>}</td>
                  <td>{s.shiftType.replace(/_/g, " ")}</td>
                  <td>
                    <div className="font-medium">{c?.name}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{l?.name}</div>
                  </td>
                  <td><span className="h-chip">{s.workerType.replace(/_/g, " ")}</span></td>
                  <td className="h-num">
                    <span style={{ color: s.workersFilled >= s.workersRequired ? "var(--status-ok-fg)" : "var(--status-warn-fg)" }}>
                      {s.workersFilled}/{s.workersRequired}
                    </span>
                  </td>
                  <td className="h-num">£{s.payRate?.toFixed(2) ?? "—"}/hr</td>
                  <td><StatusPill status={s.status} /></td>
                  <td className="text-right"><Link className="h-link text-xs" href={`/admin/shifts/${s.id}`}>Open →</Link></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </>
  );
}
