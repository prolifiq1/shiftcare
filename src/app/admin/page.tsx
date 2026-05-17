import { db } from "@/lib/db";
import { shifts, bookings, workers, timesheets, workerDocuments } from "@/lib/schema";
import { and, eq, gte, sql, lte } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { Card, Stat, StatusPill, PageHeader, LinkButton, DataTable, EmptyState, Banner } from "@/lib/ui";
import Link from "next/link";

export default async function AdminDashboard() {
  const user = await requireAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10);
  const in30ms = Date.now() + 30 * 86400 * 1000;

  const upcoming = db.select().from(shifts)
    .where(and(eq(shifts.agencyId, user.agencyId), gte(shifts.date, today), lte(shifts.date, in14)))
    .orderBy(shifts.date).limit(12).all();

  const all = db.select().from(shifts).where(eq(shifts.agencyId, user.agencyId)).all();
  const totalSlots = all.reduce((s, x) => s + x.workersRequired, 0);
  const filledSlots = all.reduce((s, x) => s + x.workersFilled, 0);
  const fillRate = totalSlots ? Math.round((filledSlots / totalSlots) * 100) : 0;
  const openSlots = totalSlots - filledSlots;

  const pendingBookings = db.select({ c: sql<number>`count(*)` }).from(bookings)
    .where(and(eq(bookings.agencyId, user.agencyId), eq(bookings.status, "REQUESTED"))).get()?.c ?? 0;

  const pendingTimesheets = db.select({ c: sql<number>`count(*)` }).from(timesheets)
    .where(and(eq(timesheets.agencyId, user.agencyId), eq(timesheets.status, "SUBMITTED"))).get()?.c ?? 0;

  const totalWorkers = db.select({ c: sql<number>`count(*)` }).from(workers)
    .where(eq(workers.agencyId, user.agencyId)).get()?.c ?? 0;

  const expiringDocs = db.select().from(workerDocuments)
    .where(and(lte(workerDocuments.expiryDate, new Date(in30ms)), gte(workerDocuments.expiryDate, new Date()))).all();

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${user.firstName}.`}
        action={<>
          <LinkButton href="/admin/import" variant="secondary">Import rota</LinkButton>
          <LinkButton href="/admin/shifts/new">New shift</LinkButton>
        </>}
      />
      <div className="p-8 space-y-6">
        {pendingBookings > 0 && (
          <Banner tone="warn" title={`${pendingBookings} booking request${pendingBookings === 1 ? "" : "s"} awaiting approval`}
            action={<LinkButton size="sm" variant="secondary" href="/admin/bookings">Review</LinkButton>}>
            Workers are waiting for confirmation on their shift picks.
          </Banner>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Fill rate" value={`${fillRate}%`} hint={`${filledSlots} of ${totalSlots} slots`} delta={{ value: "+3.2%", positive: true }} />
          <Stat label="Open slots" value={openSlots} hint="Unfilled right now" />
          <Stat label="Pending requests" value={pendingBookings} hint="Awaiting approval" />
          <Stat label="Timesheets to approve" value={pendingTimesheets} hint="Submitted" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat label="Active workers" value={totalWorkers} />
          <Stat label="Docs expiring 30d" value={expiringDocs.length} hint="Action needed" />
          <Stat label="Upcoming 14 days" value={upcoming.length} />
        </div>

        <Card
          title="Upcoming shifts"
          subtitle="Next 14 days across all clients"
          action={<Link className="h-link text-sm" href="/admin/shifts">View all →</Link>}
          padded={false}
        >
          {upcoming.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No upcoming shifts"
                body="Import a client rota or create a shift manually."
                action={<div className="flex gap-2"><LinkButton href="/admin/import" variant="secondary">Import rota</LinkButton><LinkButton href="/admin/shifts/new">New shift</LinkButton></div>}
              />
            </div>
          ) : (
            <DataTable>
              <thead><tr>
                <th>Date</th><th>Time</th><th>Type</th><th>Filled</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {upcoming.map(s => (
                  <tr key={s.id}>
                    <td className="h-num font-medium">{s.date}</td>
                    <td className="h-num">{s.startTime}–{s.endTime}{s.overnight && <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>+1d</span>}</td>
                    <td>{s.shiftType.replace(/_/g, " ")}</td>
                    <td className="h-num">{s.workersFilled}/{s.workersRequired}</td>
                    <td><StatusPill status={s.status} /></td>
                    <td className="text-right"><Link className="h-link text-xs" href={`/admin/shifts/${s.id}`}>Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
      </div>
    </>
  );
}
