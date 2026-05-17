import { db } from "@/lib/db";
import { shifts, locations, clients, bookings } from "@/lib/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { requireWorker } from "@/lib/auth";
import { Chip, EmptyState, MoneyHourly, PageHeader } from "@/lib/ui";
import Link from "next/link";
import { checkWorkerEligibility } from "@/lib/eligibility";

export default async function WorkerHome() {
  const user = await requireWorker();
  const today = new Date().toISOString().slice(0, 10);

  const candidates = db
    .select({ s: shifts, l: locations, c: clients })
    .from(shifts)
    .leftJoin(locations, eq(locations.id, shifts.locationId))
    .leftJoin(clients, eq(clients.id, shifts.clientId))
    .where(
      and(
        eq(shifts.agencyId, user.agencyId),
        gte(shifts.date, today),
        inArray(shifts.status, ["PUBLISHED", "PARTIALLY_FILLED"]),
      ),
    )
    .orderBy(shifts.date, shifts.startTime)
    .all();

  const myBookings = db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.workerId, user.id),
        inArray(bookings.status, ["REQUESTED", "APPROVED", "ASSIGNED", "CHECKED_IN"]),
      ),
    )
    .all();
  const bookedShiftIds = new Set(myBookings.map((b) => b.shiftId));

  const open = candidates.filter(
    ({ s }) => !bookedShiftIds.has(s.id) && s.workersFilled < s.workersRequired,
  );

  return (
    <>
      <PageHeader
        title="Available shifts"
        subtitle={`${open.length} open · matched to your profile`}
      />
      <div className="p-8">
        {open.length === 0 ? (
          <EmptyState
            title="Nothing open right now"
            body="Check back shortly — new shifts post throughout the day."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {open.map(({ s, l, c }) => {
              const elig = checkWorkerEligibility(user.id, s.id);
              return (
                <Link
                  key={s.id}
                  href={`/worker/shifts/${s.id}`}
                  className="block h-card hover:-translate-y-px transition-transform"
                  style={{ padding: "1.125rem 1.25rem" }}
                >
                  <div className="flex items-center justify-between">
                    <Chip>{s.shiftType.replace(/_/g, " ")}</Chip>
                    <div className="text-xs h-num" style={{ color: "var(--text-muted)" }}>
                      {s.date}
                    </div>
                  </div>
                  <div className="text-2xl font-semibold mt-2 h-num tracking-tight">
                    {s.startTime}–{s.endTime}
                    {s.overnight && (
                      <span className="text-xs ml-1.5 font-normal" style={{ color: "var(--text-muted)" }}>
                        +1d
                      </span>
                    )}
                  </div>
                  <div className="text-sm mt-1 font-medium">{c?.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{l?.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {l?.addressLine1}, {l?.city} <span className="h-num">{l?.postcode}</span>
                  </div>
                  <div
                    className="flex items-center justify-between mt-4 pt-3 text-xs"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span style={{ color: "var(--text-muted)" }}>
                        <span
                          className="h-num font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {s.workersRequired - s.workersFilled}
                        </span>{" "}
                        spots
                      </span>
                      <span className="font-medium">
                        <MoneyHourly amount={s.payRate ?? 0} />
                      </span>
                    </div>
                    {elig.eligible ? (
                      <span className="font-medium" style={{ color: "var(--status-ok-fg)" }}>
                        Eligible
                      </span>
                    ) : (
                      <span className="font-medium" style={{ color: "var(--status-danger-fg)" }}>
                        Not eligible
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
