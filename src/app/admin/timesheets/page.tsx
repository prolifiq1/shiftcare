import { db } from "@/lib/db";
import { timesheets, bookings, shifts, users, clients, documents } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin, audit, notify } from "@/lib/auth";
import { PageHeader, Tabs, DataTable, EmptyState, Avatar, StatusPill, Button, Money } from "@/lib/ui";
import { redirect } from "next/navigation";

async function approve(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const id = String(formData.get("id"));
  const ts = (await db.select().from(timesheets).where(eq(timesheets.id, id)).get());
  if (!ts) return;
  (await db.update(timesheets).set({ status: "APPROVED", approvedAt: new Date(), approvedBy: user.id }).where(eq(timesheets.id, id)).run());
  (await db.update(bookings).set({ status: "TIMESHEET_APPROVED" }).where(eq(bookings.id, ts.bookingId)).run());
  await audit(user.id, user.agencyId, "timesheet.approve", { type: "timesheet", id });
  await notify(ts.workerId, {
    type: "TIMESHEET_APPROVED",
    title: "Timesheet approved",
    body: `Approved for ${(ts.workedMinutes / 60).toFixed(2)} hrs · £${ts.totalPay?.toFixed(2)}`,
    href: "/worker/schedule",
  });
  redirect("/admin/timesheets");
}

async function dispute(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") || "Please review hours.");
  const ts = (await db.select().from(timesheets).where(eq(timesheets.id, id)).get());
  if (!ts) return;
  (await db.update(timesheets).set({ status: "DISPUTED", disputeReason: reason }).where(eq(timesheets.id, id)).run());
  await audit(user.id, user.agencyId, "timesheet.dispute", { type: "timesheet", id }, { reason });
  await notify(ts.workerId, {
    type: "TIMESHEET_DISPUTED",
    title: "Timesheet needs attention",
    body: reason,
    href: "/worker/schedule",
  });
  redirect("/admin/timesheets");
}

export default async function Timesheets({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab || "submitted";

  const base = (await db
    .select({ t: timesheets, b: bookings, s: shifts, u: users, c: clients })
    .from(timesheets)
    .leftJoin(bookings, eq(bookings.id, timesheets.bookingId))
    .leftJoin(shifts, eq(shifts.id, bookings.shiftId))
    .leftJoin(users, eq(users.id, timesheets.workerId))
    .leftJoin(clients, eq(clients.id, timesheets.clientId))
    .where(eq(timesheets.agencyId, user.agencyId))
    .orderBy(desc(timesheets.submittedAt))
    .all());

  const tsDocs = (await db
    .select()
    .from(documents)
    .where(and(eq(documents.agencyId, user.agencyId), eq(documents.kind, "TIMESHEET")))
    .all());
  const docByBooking = new Map(tsDocs.map((d) => [d.bookingId ?? "", d.id]));

  const filter = (statuses: string[]) => base.filter((r) => statuses.includes(r.t.status));
  const tabs = [
    { key: "submitted", label: "To approve", href: "/admin/timesheets?tab=submitted", count: filter(["SUBMITTED"]).length },
    { key: "approved", label: "Approved", href: "/admin/timesheets?tab=approved", count: filter(["APPROVED"]).length },
    { key: "disputed", label: "Disputed", href: "/admin/timesheets?tab=disputed", count: filter(["DISPUTED"]).length },
    { key: "all", label: "All", href: "/admin/timesheets?tab=all", count: base.length },
  ];
  const groupMap: Record<string, string[]> = {
    submitted: ["SUBMITTED"],
    approved: ["APPROVED"],
    disputed: ["DISPUTED"],
  };
  const rows = tab === "all" ? base : base.filter((r) => (groupMap[tab] || []).includes(r.t.status));

  return (
    <>
      <PageHeader title="Timesheets" subtitle={`${base.length} total · ${filter(["SUBMITTED"]).length} awaiting approval`} />
      <div className="px-8 pt-4">
        <Tabs tabs={tabs} current={tab} />
      </div>
      <div className="p-8">
        {rows.length === 0 ? (
          <EmptyState title="Nothing to review" body="Submitted timesheets land here." />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Shift</th>
                <th>Client</th>
                <th>Hours</th>
                <th>Pay</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, s, u, c }) => (
                <tr key={t.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={`${u?.firstName ?? ""} ${u?.lastName ?? ""}`} />
                      <div>
                        <div className="font-medium">{u?.firstName} {u?.lastName}</div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{u?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="h-num">
                    <div>{s?.date}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{s?.startTime}–{s?.endTime}</div>
                  </td>
                  <td>{c?.name}</td>
                  <td className="h-num font-medium">{(t.workedMinutes / 60).toFixed(2)}</td>
                  <td className="h-num"><Money amount={t.totalPay} /></td>
                  <td>
                    <StatusPill status={t.status} />
                    {docByBooking.get(t.bookingId) && (
                      <a
                        className="h-link text-xs block mt-1"
                        href={`/api/documents/${docByBooking.get(t.bookingId)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View signed sheet →
                      </a>
                    )}
                  </td>
                  <td className="text-right">
                    {t.status === "SUBMITTED" && (
                      <div className="inline-flex gap-2">
                        <form action={approve}>
                          <input type="hidden" name="id" value={t.id} />
                          <Button size="sm" type="submit">Approve</Button>
                        </form>
                        <form action={dispute}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="reason" value="Please review the hours and resubmit." />
                          <Button size="sm" variant="ghost" type="submit">Dispute</Button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </>
  );
}
