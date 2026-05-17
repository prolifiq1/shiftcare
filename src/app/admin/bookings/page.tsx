import { db } from "@/lib/db";
import { bookings, shifts, users, clients } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, StatusPill, DataTable, EmptyState, Tabs, Avatar } from "@/lib/ui";
import Link from "next/link";

export default async function BookingsList({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab || "requested";

  const base = (await db.select({ b: bookings, s: shifts, u: users, c: clients })
    .from(bookings)
    .leftJoin(shifts, eq(shifts.id, bookings.shiftId))
    .leftJoin(users, eq(users.id, bookings.workerId))
    .leftJoin(clients, eq(clients.id, shifts.clientId))
    .where(eq(bookings.agencyId, user.agencyId)).all());

  const filter = (statuses: string[]) => base.filter(r => statuses.includes(r.b.status));
  const tabs = [
    { key: "requested", label: "Requests", href: "/admin/bookings?tab=requested", count: filter(["REQUESTED"]).length },
    { key: "approved",  label: "Approved", href: "/admin/bookings?tab=approved", count: filter(["APPROVED","ASSIGNED","CHECKED_IN"]).length },
    { key: "completed", label: "Completed", href: "/admin/bookings?tab=completed", count: filter(["CHECKED_OUT","TIMESHEET_SUBMITTED","TIMESHEET_APPROVED","PAID"]).length },
    { key: "cancelled", label: "Cancelled", href: "/admin/bookings?tab=cancelled", count: filter(["REJECTED","CANCELLED_BY_WORKER","CANCELLED_BY_AGENCY","NO_SHOW"]).length },
    { key: "all", label: "All", href: "/admin/bookings?tab=all", count: base.length },
  ];
  const groupMap: Record<string, string[]> = {
    requested: ["REQUESTED"],
    approved: ["APPROVED","ASSIGNED","CHECKED_IN"],
    completed: ["CHECKED_OUT","TIMESHEET_SUBMITTED","TIMESHEET_APPROVED","PAID"],
    cancelled: ["REJECTED","CANCELLED_BY_WORKER","CANCELLED_BY_AGENCY","NO_SHOW"],
  };
  const rows = tab === "all" ? base : base.filter(r => (groupMap[tab] || []).includes(r.b.status));

  return (
    <>
      <PageHeader title="Bookings" subtitle={`${base.length} bookings across all shifts`} />
      <div className="px-8 pt-4">
        <Tabs tabs={tabs} current={tab} />
      </div>
      <div className="p-8">
        {rows.length === 0 ? (
          <EmptyState title="Nothing here" body={tab === "requested" ? "No requests awaiting approval." : "No bookings in this tab."} />
        ) : (
          <DataTable>
            <thead><tr><th>Worker</th><th>Shift</th><th>Client</th><th>Requested</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ b, s, u, c }) => (
                <tr key={b.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={`${u?.firstName ?? ""} ${u?.lastName ?? ""}`} />
                      <div>
                        <div className="font-medium">{u?.firstName} {u?.lastName}</div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{u?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="h-num"><div>{s?.date}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>{s?.startTime}–{s?.endTime} · {s?.shiftType}</div></td>
                  <td>{c?.name}</td>
                  <td className="text-xs h-num" style={{ color: "var(--text-muted)" }}>{b.requestedAt?.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td><StatusPill status={b.status} /></td>
                  <td className="text-right">{s && <Link className="h-link text-xs" href={`/admin/shifts/${s.id}`}>Open shift →</Link>}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </>
  );
}
