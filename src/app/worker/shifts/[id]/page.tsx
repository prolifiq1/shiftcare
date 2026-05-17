import { db } from "@/lib/db";
import { shifts, locations, clients, bookings } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { requireWorker } from "@/lib/auth";
import { StatusPill, Banner, Chip, Card, MoneyHourly, PageHeader } from "@/lib/ui";
import { notFound, redirect } from "next/navigation";
import { checkWorkerEligibility } from "@/lib/eligibility";
import { randomUUID } from "crypto";

async function pickShift(formData: FormData) {
  "use server";
  const user = await requireWorker();
  const shiftId = String(formData.get("shiftId"));
  const elig = checkWorkerEligibility(user.id, shiftId);
  if (!elig.eligible) {
    redirect(`/worker/shifts/${shiftId}?error=` + encodeURIComponent(elig.reasons.join("; ")));
  }
  const shift = db.select().from(shifts).where(eq(shifts.id, shiftId)).get();
  if (!shift) redirect("/worker");
  if (shift!.workersFilled >= shift!.workersRequired) {
    redirect(`/worker/shifts/${shiftId}?error=Shift+just+filled`);
  }
  const status = shift!.assignmentMode === "APPROVAL_REQUIRED" ? "REQUESTED" : "APPROVED";
  db.insert(bookings)
    .values({
      id: randomUUID(),
      shiftId,
      workerId: user.id,
      agencyId: user.agencyId,
      status,
      payRateSnapshot: shift!.payRate,
      approvedAt: status === "APPROVED" ? new Date() : null,
    })
    .run();
  if (status === "APPROVED") {
    const filled = shift!.workersFilled + 1;
    const newStatus = filled >= shift!.workersRequired ? "FILLED" : "PARTIALLY_FILLED";
    db.update(shifts).set({ workersFilled: filled, status: newStatus }).where(eq(shifts.id, shiftId)).run();
  }
  redirect("/worker/schedule");
}

export default async function ShiftDetailWorker({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireWorker();
  const { id } = await params;
  const { error } = await searchParams;
  const shift = db.select().from(shifts).where(eq(shifts.id, id)).get();
  if (!shift) notFound();
  const location = db.select().from(locations).where(eq(locations.id, shift.locationId)).get();
  const client = db.select().from(clients).where(eq(clients.id, shift.clientId)).get();
  const existing = db
    .select()
    .from(bookings)
    .where(and(eq(bookings.shiftId, id), eq(bookings.workerId, user.id)))
    .get();
  const elig = checkWorkerEligibility(user.id, id);

  return (
    <>
      <PageHeader
        breadcrumb={<><a className="h-link" href="/worker">Available shifts</a> / <span>{shift.date}</span></>}
        title={
          <span>
            {shift.shiftType.replace(/_/g, " ")} shift ·{" "}
            <span className="h-num">{shift.startTime}–{shift.endTime}</span>
          </span>
        }
        subtitle={`${client?.name} · ${location?.name}`}
        action={existing && <StatusPill status={existing.status} />}
      />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Shift details">
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-y-4 text-sm">
              <Stat k="Date">
                <span className="h-num">{shift.date}</span>
                {shift.overnight && <span className="h-num"> → {shift.endDate}</span>}
              </Stat>
              <Stat k="Time" num>{shift.startTime} – {shift.endTime}</Stat>
              <Stat k="Duration" num>{(shift.durationMinutes / 60).toFixed(2)} hrs</Stat>
              <Stat k="Pay rate"><MoneyHourly amount={shift.payRate ?? 0} /></Stat>
              <Stat k="Worker type">{shift.workerType.replace(/_/g, " ")}</Stat>
              <Stat k="Spots open" num>
                {shift.workersRequired - shift.workersFilled} of {shift.workersRequired}
              </Stat>
              <Stat k="Address" span={3}>
                {location?.addressLine1}, {location?.city} <span className="h-num">{location?.postcode}</span>
              </Stat>
            </dl>
          </Card>

          {error && <Banner tone="danger" title="Couldn’t book this shift">{decodeURIComponent(error)}</Banner>}
          {existing && (
            <Banner tone="info" title="You’ve booked this shift">
              See it in your schedule. Status: <strong>{existing.status.replace(/_/g, " ")}</strong>.
            </Banner>
          )}
          {!existing && !elig.eligible && (
            <Banner tone="danger" title="You’re not eligible for this shift">
              <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                {elig.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Banner>
          )}
        </div>

        <div className="space-y-3">
          <Card title="Pick up this shift">
            <div className="flex items-center justify-between mb-3">
              <Chip>{shift.shiftType.replace(/_/g, " ")}</Chip>
              <span className="font-semibold">
                <MoneyHourly amount={shift.payRate ?? 0} />
              </span>
            </div>
            <div className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              {shift.assignmentMode === "APPROVAL_REQUIRED"
                ? "Coordinator approval required."
                : "Auto-confirmed on the spot."}
            </div>
            {existing ? (
              <a href="/worker/schedule" className="h-btn h-btn-secondary h-btn-block">
                View in schedule
              </a>
            ) : !elig.eligible ? (
              <button disabled className="h-btn h-btn-primary h-btn-block">
                Not eligible
              </button>
            ) : (
              <form action={pickShift}>
                <input type="hidden" name="shiftId" value={shift.id} />
                <button type="submit" className="h-btn h-btn-primary h-btn-block h-btn-lg">
                  Pick this shift
                </button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ k, children, num, span }: { k: string; children: React.ReactNode; num?: boolean; span?: number }) {
  return (
    <div className={span === 3 ? "col-span-2 md:col-span-3" : ""}>
      <dt className="text-xs" style={{ color: "var(--text-muted)" }}>{k}</dt>
      <dd className={"mt-0.5 font-medium " + (num ? "h-num" : "")}>{children}</dd>
    </div>
  );
}
