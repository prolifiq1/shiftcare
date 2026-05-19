import { db } from "@/lib/db";
import { bookings, shifts, timesheets, clients, documents } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireWorker, notify, audit } from "@/lib/auth";
import { Card, Field, Textarea, Button, Banner } from "@/lib/ui";
import { Uploader, DeleteDoc } from "@/components/Uploader";
import { notFound, redirect } from "next/navigation";
import { randomUUID } from "crypto";
import Link from "next/link";

async function submitTimesheet(formData: FormData) {
  "use server";
  const user = await requireWorker();
  const bookingId = String(formData.get("bookingId"));
  const workedMinutes = Math.max(0, Math.round(Number(formData.get("workedHours") || 0) * 60));
  const breakMinutes = Math.max(0, Number(formData.get("breakMinutes") || 0));
  const mileage = Math.max(0, Number(formData.get("mileage") || 0));
  const notes = String(formData.get("notes") || "") || null;

  const b = (await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.workerId, user.id))).get());
  if (!b) redirect("/worker/schedule");
  const s = (await db.select().from(shifts).where(eq(shifts.id, b!.shiftId)).get());
  if (!s) redirect("/worker/schedule");

  const payable = Math.max(0, workedMinutes - breakMinutes);
  const totalPay = (payable / 60) * (b!.payRateSnapshot ?? s!.payRate ?? 0);

  const existing = (await db.select().from(timesheets).where(eq(timesheets.bookingId, bookingId)).get());
  if (existing) {
    (await db.update(timesheets)
      .set({ workedMinutes, breakMinutes, mileage, notes, totalPay, status: "SUBMITTED", submittedAt: new Date() })
      .where(eq(timesheets.id, existing.id))
      .run());
  } else {
    (await db.insert(timesheets)
      .values({
        id: randomUUID(),
        bookingId,
        workerId: user.id,
        agencyId: user.agencyId,
        clientId: s!.clientId,
        workedMinutes,
        breakMinutes,
        mileage,
        notes,
        totalPay,
        status: "SUBMITTED",
        submittedAt: new Date(),
      })
      .run());
  }

  (await db.update(bookings).set({ status: "TIMESHEET_SUBMITTED" }).where(eq(bookings.id, bookingId)).run());
  await audit(user.id, user.agencyId, "timesheet.submit", { type: "booking", id: bookingId });

  // Notify any admin in the agency? We notify a generic admin via createdBy of the shift (best effort).
  if (s!.createdBy) {
    await notify(s!.createdBy, {
      type: "TIMESHEET_SUBMITTED",
      title: "Timesheet submitted",
      body: `${user.firstName} ${user.lastName} · ${(workedMinutes / 60).toFixed(2)} hrs`,
      href: "/admin/timesheets",
    });
  }

  redirect("/worker/schedule");
}

export default async function SubmitTimesheet({ params }: { params: Promise<{ bookingId: string }> }) {
  const user = await requireWorker();
  const { bookingId } = await params;
  const b = (await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.workerId, user.id))).get());
  if (!b) notFound();
  const s = (await db.select().from(shifts).where(eq(shifts.id, b.shiftId)).get());
  if (!s) notFound();
  const c = (await db.select().from(clients).where(eq(clients.id, s.clientId)).get());
  const existing = (await db.select().from(timesheets).where(eq(timesheets.bookingId, bookingId)).get());
  const attachment = (await db
    .select()
    .from(documents)
    .where(and(eq(documents.bookingId, bookingId), eq(documents.kind, "TIMESHEET")))
    .orderBy(desc(documents.createdAt))
    .get());

  const defaultHours = b.checkInTime && b.checkOutTime
    ? Math.max(0, (b.checkOutTime.getTime() - b.checkInTime.getTime()) / 3600000)
    : s.durationMinutes / 60;

  return (
    <div className="p-5 space-y-4">
      <Link href="/worker/schedule" className="h-link text-sm inline-block">← Back to schedule</Link>

      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Submit timesheet</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          {c?.name} · <span className="h-num">{s.date} {s.startTime}–{s.endTime}</span>
        </p>
      </div>

      {existing?.status === "DISPUTED" && (
        <Banner tone="warn" title="Coordinator requested a change">{existing.disputeReason}</Banner>
      )}
      {existing?.status === "APPROVED" && (
        <Banner tone="ok" title="Already approved">No further action needed.</Banner>
      )}

      <Card>
        <form action={submitTimesheet} className="space-y-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Hours worked"
              type="number"
              step="0.25"
              name="workedHours"
              defaultValue={defaultHours.toFixed(2)}
              required
            />
            <Field label="Break (mins)" type="number" name="breakMinutes" defaultValue={existing?.breakMinutes ?? 0} />
          </div>
          <Field label="Mileage" type="number" step="0.1" name="mileage" defaultValue={existing?.mileage ?? 0} />
          <Textarea label="Notes (optional)" name="notes" rows={3} defaultValue={existing?.notes ?? ""} />
          <div className="flex gap-2 pt-1">
            <Button type="submit">Submit timesheet</Button>
            <Link href="/worker/schedule" className="h-btn h-btn-ghost">Cancel</Link>
          </div>
        </form>
      </Card>

      <Card title="Signed timesheet (optional)" subtitle="Upload a photo or PDF of the signed sheet.">
        {attachment ? (
          <div className="flex items-center justify-between text-sm">
            <a className="h-link" href={`/api/documents/${attachment.id}`} target="_blank" rel="noreferrer">
              {attachment.fileName}
            </a>
            <DeleteDoc id={attachment.id} label="Remove" />
          </div>
        ) : (
          <Uploader bookingId={bookingId} fixedKind="TIMESHEET" />
        )}
      </Card>
    </div>
  );
}
