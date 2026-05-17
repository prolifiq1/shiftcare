import { db } from "@/lib/db";
import { shifts, locations, clients, bookings, users } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { requireAdmin, notify, audit } from "@/lib/auth";
import { PageHeader, StatusPill, Card, Button, Avatar, Meta, MoneyHourly } from "@/lib/ui";
import { notFound, redirect } from "next/navigation";

async function approveBooking(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const id = String(formData.get("bookingId"));
  const action = String(formData.get("action"));
  const booking = (await db.select().from(bookings).where(eq(bookings.id, id)).get());
  if (!booking) return;
  const shift = (await db.select().from(shifts).where(eq(shifts.id, booking.shiftId)).get());
  if (action === "approve") {
    (await db.update(bookings).set({ status: "APPROVED", approvedAt: new Date(), approvedBy: user.id }).where(eq(bookings.id, id)).run());
    if (shift) {
      const filled = shift.workersFilled + 1;
      const newStatus = filled >= shift.workersRequired ? "FILLED" : "PARTIALLY_FILLED";
      (await db.update(shifts).set({ workersFilled: filled, status: newStatus }).where(eq(shifts.id, shift.id)).run());
    }
    await audit(user.id, user.agencyId, "booking.approve", { type: "booking", id });
    await notify(booking.workerId, { type: "BOOKING_APPROVED", title: "Booking confirmed", body: `Your shift on ${shift?.date} ${shift?.startTime}–${shift?.endTime} is confirmed.`, href: "/worker/schedule" });
  } else {
    (await db.update(bookings).set({ status: "REJECTED", cancelledAt: new Date(), cancellationReason: "Rejected by coordinator" }).where(eq(bookings.id, id)).run());
    await audit(user.id, user.agencyId, "booking.reject", { type: "booking", id });
    await notify(booking.workerId, { type: "BOOKING_REJECTED", title: "Booking declined", body: `Your request for ${shift?.date} ${shift?.startTime}–${shift?.endTime} was not approved.`, href: "/worker/schedule" });
  }
  redirect(`/admin/shifts/${booking.shiftId}`);
}

async function publishShift(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const id = String(formData.get("shiftId"));
  (await db.update(shifts).set({ status: "PUBLISHED", publishedAt: new Date() }).where(eq(shifts.id, id)).run());
  await audit(user.id, user.agencyId, "shift.publish", { type: "shift", id });
  redirect(`/admin/shifts/${id}`);
}

async function cancelShift(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const id = String(formData.get("shiftId"));
  (await db.update(shifts).set({ status: "CANCELLED_BY_AGENCY" }).where(eq(shifts.id, id)).run());
  const related = (await db.select().from(bookings).where(eq(bookings.shiftId, id)).all());
  (await db.update(bookings).set({ status: "CANCELLED_BY_AGENCY", cancelledAt: new Date() }).where(eq(bookings.shiftId, id)).run());
  for (const b of related) await notify(b.workerId, { type: "SHIFT_CANCELLED", title: "Shift cancelled", body: "This shift has been cancelled by the agency.", href: "/worker/schedule" });
  await audit(user.id, user.agencyId, "shift.cancel", { type: "shift", id });
  redirect(`/admin/shifts/${id}`);
}

export default async function ShiftDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const shift = (await db.select().from(shifts).where(and(eq(shifts.id, id), eq(shifts.agencyId, user.agencyId))).get());
  if (!shift) notFound();
  const location = (await db.select().from(locations).where(eq(locations.id, shift.locationId)).get());
  const client = (await db.select().from(clients).where(eq(clients.id, shift.clientId)).get());
  const shiftBookings = (await db.select({ b: bookings, u: users })
    .from(bookings).leftJoin(users, eq(users.id, bookings.workerId))
    .where(eq(bookings.shiftId, id)).all());

  return (
    <>
      <PageHeader
        breadcrumb={<><a className="h-link" href="/admin/shifts">Shifts</a> / <span>{shift.date}</span></>}
        title={<span>{shift.shiftType.replace(/_/g, " ")} shift · <span className="h-num">{shift.startTime}–{shift.endTime}</span></span>}
        subtitle={<Meta items={[client?.name, location?.name, location?.postcode]} />}
        action={<StatusPill status={shift.status} />}
      />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Shift details">
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-y-4 text-sm">
              <Term k="Date">{shift.date}{shift.overnight && ` → ${shift.endDate}`}</Term>
              <Term k="Time" num>{shift.startTime} – {shift.endTime}</Term>
              <Term k="Duration" num>{(shift.durationMinutes / 60).toFixed(2)} hrs</Term>
              <Term k="Worker type">{shift.workerType.replace(/_/g, " ")}</Term>
              <Term k="Required"><span className="h-num">{shift.workersRequired}</span></Term>
              <Term k="Filled"><span className="h-num">{shift.workersFilled}</span></Term>
              <Term k="Pay rate"><MoneyHourly amount={shift.payRate} /></Term>
              <Term k="Charge rate"><MoneyHourly amount={shift.chargeRate} /></Term>
              <Term k="Assignment">{shift.assignmentMode.replace(/_/g, " ")}</Term>
              <Term k="Address" span={3}>{location?.addressLine1}, {location?.city} {location?.postcode}</Term>
            </dl>
            {shift.notes && (
              <div className="mt-5 pt-5 border-t text-sm" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="h-section-title mb-1">Notes</div>{shift.notes}
              </div>
            )}
          </Card>

          <Card title={`Bookings (${shiftBookings.length})`} padded={false}>
            {shiftBookings.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>No worker requests yet.</div>
            ) : (
              <table className="h-table">
                <thead><tr><th>Worker</th><th>Status</th><th>Requested</th><th></th></tr></thead>
                <tbody>
                  {shiftBookings.map(({ b, u }) => (
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
                      <td><StatusPill status={b.status} /></td>
                      <td className="text-xs h-num" style={{ color: "var(--text-muted)" }}>
                        {b.requestedAt?.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="text-right">
                        {b.status === "REQUESTED" && (
                          <div className="inline-flex gap-2">
                            <form action={approveBooking}>
                              <input type="hidden" name="bookingId" value={b.id} />
                              <input type="hidden" name="action" value="approve" />
                              <Button size="sm" type="submit">Approve</Button>
                            </form>
                            <form action={approveBooking}>
                              <input type="hidden" name="bookingId" value={b.id} />
                              <input type="hidden" name="action" value="reject" />
                              <Button size="sm" variant="danger" type="submit">Decline</Button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card title="Actions">
            <div className="space-y-2">
              {shift.status !== "PUBLISHED" && shift.status !== "CANCELLED_BY_AGENCY" && shift.status !== "FILLED" && (
                <form action={publishShift}>
                  <input type="hidden" name="shiftId" value={shift.id} />
                  <Button type="submit" block>Publish to marketplace</Button>
                </form>
              )}
              {!shift.status.startsWith("CANCELLED") && (
                <form action={cancelShift}>
                  <input type="hidden" name="shiftId" value={shift.id} />
                  <Button type="submit" variant="danger" block>Cancel shift</Button>
                </form>
              )}
            </div>
          </Card>
          <Card title="Fill">
            <div className="h-num text-3xl font-semibold" style={{ letterSpacing: "-0.02em" }}>{shift.workersFilled}/{shift.workersRequired}</div>
            <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Workers confirmed</div>
            <div className="mt-3 h-2 rounded-full" style={{ background: "var(--base-03)" }}>
              <div className="h-2 rounded-full" style={{
                width: `${Math.min(100, (shift.workersFilled / shift.workersRequired) * 100)}%`,
                background: "var(--brand-500)",
                transition: "width .3s ease",
              }} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Term({ k, children, num, span }: { k: string; children: React.ReactNode; num?: boolean; span?: number }) {
  return (
    <div className={span === 3 ? "col-span-2 md:col-span-3" : ""}>
      <dt className="text-xs" style={{ color: "var(--text-muted)" }}>{k}</dt>
      <dd className={num ? "h-num mt-0.5 font-medium" : "mt-0.5 font-medium"}>{children}</dd>
    </div>
  );
}
