import { db } from "@/lib/db";
import { bookings, shifts, locations, clients } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { requireWorker } from "@/lib/auth";
import { StatusPill, Button, EmptyState, Chip, PageHeader, LinkButton } from "@/lib/ui";
import Link from "next/link";
import { redirect } from "next/navigation";

async function checkIn(formData: FormData) {
  "use server";
  const user = await requireWorker();
  const id = String(formData.get("bookingId"));
  db.update(bookings)
    .set({ status: "CHECKED_IN", checkInTime: new Date() })
    .where(and(eq(bookings.id, id), eq(bookings.workerId, user.id)))
    .run();
  redirect("/worker/schedule");
}

async function checkOut(formData: FormData) {
  "use server";
  const user = await requireWorker();
  const id = String(formData.get("bookingId"));
  db.update(bookings)
    .set({ status: "CHECKED_OUT", checkOutTime: new Date() })
    .where(and(eq(bookings.id, id), eq(bookings.workerId, user.id)))
    .run();
  redirect("/worker/schedule");
}

async function cancelBooking(formData: FormData) {
  "use server";
  const user = await requireWorker();
  const id = String(formData.get("bookingId"));
  const booking = db.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.workerId, user.id))).get();
  if (!booking) redirect("/worker/schedule");
  if (booking!.status === "APPROVED") {
    const s = db.select().from(shifts).where(eq(shifts.id, booking!.shiftId)).get();
    if (s) {
      const filled = Math.max(0, s.workersFilled - 1);
      const newStatus = filled === 0 ? "PUBLISHED" : "PARTIALLY_FILLED";
      db.update(shifts).set({ workersFilled: filled, status: newStatus }).where(eq(shifts.id, s.id)).run();
    }
  }
  db.update(bookings)
    .set({ status: "CANCELLED_BY_WORKER", cancelledAt: new Date(), cancellationReason: "Worker cancelled" })
    .where(eq(bookings.id, id))
    .run();
  redirect("/worker/schedule");
}

export default async function MySchedule() {
  const user = await requireWorker();
  const rows = db
    .select({ b: bookings, s: shifts, l: locations, c: clients })
    .from(bookings)
    .leftJoin(shifts, eq(shifts.id, bookings.shiftId))
    .leftJoin(locations, eq(locations.id, shifts.locationId))
    .leftJoin(clients, eq(clients.id, shifts.clientId))
    .where(eq(bookings.workerId, user.id))
    .orderBy(shifts.date)
    .all();

  const upcoming = rows.filter(
    (r) =>
      ![
        "CANCELLED_BY_WORKER",
        "CANCELLED_BY_AGENCY",
        "REJECTED",
        "CHECKED_OUT",
        "TIMESHEET_SUBMITTED",
        "TIMESHEET_APPROVED",
        "PAID",
      ].includes(r.b.status),
  );
  const past = rows.filter((r) => !upcoming.includes(r));

  return (
    <>
      <PageHeader
        title="My schedule"
        subtitle={`${upcoming.length} upcoming · ${past.length} past`}
        action={<LinkButton href="/worker">Browse shifts</LinkButton>}
      />
      <div className="p-8 space-y-8">
        {upcoming.length === 0 && past.length === 0 && (
          <EmptyState
            title="No bookings yet"
            body="Pick up your first shift to start earning."
            action={<LinkButton href="/worker">Browse shifts</LinkButton>}
          />
        )}

        {upcoming.length > 0 && (
          <section>
            <h3 className="h-section-title mb-3">Upcoming</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcoming.map(({ b, s, l, c }) => (
                <div key={b.id} className="h-card" style={{ padding: "1.125rem 1.25rem" }}>
                  <div className="flex items-center justify-between">
                    <Chip>{s?.shiftType.replace(/_/g, " ")}</Chip>
                    <StatusPill status={b.status} />
                  </div>
                  <div className="text-2xl font-semibold mt-2 h-num tracking-tight">
                    {s?.startTime}–{s?.endTime}
                  </div>
                  <div className="text-sm mt-1">
                    <span className="h-num">{s?.date}</span> · <span className="font-medium">{c?.name}</span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {l?.addressLine1}, <span className="h-num">{l?.postcode}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    {(b.status === "APPROVED" || b.status === "ASSIGNED") && (
                      <form action={checkIn}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <Button size="sm" type="submit">Check in</Button>
                      </form>
                    )}
                    {b.status === "CHECKED_IN" && (
                      <form action={checkOut}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <Button size="sm" type="submit">Check out</Button>
                      </form>
                    )}
                    {(b.status === "REQUESTED" || b.status === "APPROVED") && (
                      <form action={cancelBooking}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <Button size="sm" variant="ghost" type="submit">Cancel</Button>
                      </form>
                    )}
                    <Link href={`/worker/shifts/${s?.id}`} className="h-link text-xs self-center ml-auto">
                      View →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h3 className="h-section-title mb-3">History</h3>
            <div className="space-y-2">
              {past.map(({ b, s, c }) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between text-sm rounded-lg px-4 py-3"
                  style={{ background: "var(--base-02)", border: "1px solid var(--border-subtle)" }}
                >
                  <div>
                    <div>
                      <span className="h-num font-medium">{s?.date}</span> ·{" "}
                      <span className="h-num">{s?.startTime}–{s?.endTime}</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {c?.name} · {s?.shiftType.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {b.status === "CHECKED_OUT" && (
                      <Link href={`/worker/timesheets/${b.id}`} className="h-btn h-btn-secondary h-btn-sm">
                        Submit timesheet
                      </Link>
                    )}
                    <StatusPill status={b.status} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
