import { db } from "./db";
import { workerDocuments, trainingRecords, bookings, shifts, workers } from "./schema";
import { and, eq, inArray, ne } from "drizzle-orm";

export type EligibilityCheck = {
  eligible: boolean;
  reasons: string[];
};

export async function checkWorkerEligibility(workerId: string, shiftId: string): Promise<EligibilityCheck> {
  const reasons: string[] = [];
  const worker = (await db.select().from(workers).where(eq(workers.id, workerId)).get());
  const shift = (await db.select().from(shifts).where(eq(shifts.id, shiftId)).get());
  if (!worker || !shift) return { eligible: false, reasons: ["Worker or shift not found"] };

  if (!worker.active) reasons.push("Worker is inactive");
  if (worker.onboardingStatus !== "APPROVED") reasons.push("Onboarding not complete");

  const shiftDate = new Date(shift.date + "T00:00:00Z");

  // Compliance documents
  const docs = (await db.select().from(workerDocuments).where(eq(workerDocuments.workerId, workerId)).all());
  const requiredDocTypes = ["DBS_ENHANCED", "RIGHT_TO_WORK"];
  for (const t of requiredDocTypes) {
    const doc = docs.find((d) => d.documentType === t && d.status === "APPROVED");
    if (!doc) {
      reasons.push(`Missing ${t.replace("_", " ").toLowerCase()}`);
      continue;
    }
    if (doc.expiryDate && doc.expiryDate.getTime() < shiftDate.getTime()) {
      reasons.push(`${t.replace("_", " ").toLowerCase()} expired`);
    }
  }

  // Training records vs shift requirement
  const requiredTraining: string[] = JSON.parse(shift.requiredTraining || "[]");
  const trainings = (await db.select().from(trainingRecords).where(eq(trainingRecords.workerId, workerId)).all());
  for (const tr of requiredTraining) {
    const rec = trainings.find((t) => t.trainingType === tr);
    if (!rec) {
      reasons.push(`Missing training: ${tr}`);
      continue;
    }
    if (rec.expiryDate && rec.expiryDate.getTime() < shiftDate.getTime()) {
      reasons.push(`Training expired: ${tr}`);
    }
  }

  // Worker types check
  const workerTypes: string[] = JSON.parse(worker.workerTypes || "[]");
  if (workerTypes.length && !workerTypes.includes(shift.workerType)) {
    reasons.push(`Worker type ${shift.workerType} not held`);
  }

  // Conflict check: any confirmed booking on the same day overlapping
  const myBookings = (await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.workerId, workerId),
        inArray(bookings.status, ["APPROVED", "ASSIGNED", "CHECKED_IN"]),
        ne(bookings.shiftId, shiftId)
      )
    )
    .all());
  for (const b of myBookings) {
    const other = (await db.select().from(shifts).where(eq(shifts.id, b.shiftId)).get());
    if (!other) continue;
    if (overlaps(other, shift)) {
      reasons.push(`Conflicts with shift on ${other.date} ${other.startTime}-${other.endTime}`);
      break;
    }
    if (lessThanRest(other, shift, 8)) {
      reasons.push(`Less than 8h rest period`);
      break;
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

type S = { date: string; endDate: string; startTime: string; endTime: string };

function toMs(date: string, time: string): number {
  return new Date(`${date}T${time}:00Z`).getTime();
}

function overlaps(a: S, b: S): boolean {
  const aStart = toMs(a.date, a.startTime);
  const aEnd = toMs(a.endDate, a.endTime);
  const bStart = toMs(b.date, b.startTime);
  const bEnd = toMs(b.endDate, b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

function lessThanRest(a: S, b: S, hours: number): boolean {
  const aEnd = toMs(a.endDate, a.endTime);
  const bStart = toMs(b.date, b.startTime);
  const bEnd = toMs(b.endDate, b.endTime);
  const aStart = toMs(a.date, a.startTime);
  const gapAB = bStart - aEnd;
  const gapBA = aStart - bEnd;
  const restMs = hours * 3600 * 1000;
  return (gapAB >= 0 && gapAB < restMs) || (gapBA >= 0 && gapBA < restMs);
}
