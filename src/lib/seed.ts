import { db, ensureSchema } from "./db";
import {
  agencies,
  users,
  clients,
  locations,
  workers,
  workerDocuments,
  trainingRecords,
  shifts,
} from "./schema";
import { createClerkClient } from "@clerk/backend";
import { randomUUID } from "crypto";

const clerk = process.env.CLERK_SECRET_KEY
  ? createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  : null;

// Idempotent: returns the Clerk user id for this email, creating it (with a
// verified email — Backend-created emails are auto-verified) if needed.
async function ensureClerkUser(
  email: string, password: string, firstName: string, lastName: string,
): Promise<string | null> {
  if (!clerk) return null;
  const existing = await clerk.users.getUserList({ emailAddress: [email] });
  if (existing.data.length > 0) {
    const id = existing.data[0].id;
    try { await clerk.users.updateUser(id, { password, skipPasswordChecks: true }); } catch {}
    return id;
  }
  const u = await clerk.users.createUser({
    emailAddress: [email],
    password,
    firstName,
    lastName,
    skipPasswordChecks: true,
    skipLegalChecks: true,
  });
  return u.id;
}

export async function seedDatabase() {
  console.log("Seeding...");
  await ensureSchema();

  // Wipe (idempotent)
  await db.delete(shifts);
  await db.delete(workerDocuments);
  await db.delete(trainingRecords);
  await db.delete(workers);
  await db.delete(locations);
  await db.delete(clients);
  await db.delete(users);
  await db.delete(agencies);

  // Platform super-admin sits in its own internal agency.
  const platformAgencyId = randomUUID();
  await db.insert(agencies).values({
    id: platformAgencyId,
    name: "ShiftCare Platform",
    slug: "platform",
    status: "ACTIVE",
    plan: "INTERNAL",
  });
  const ownerEmail = "owner@shiftcaredemo.com";
  await db.insert(users).values({
    id: randomUUID(),
    agencyId: platformAgencyId,
    email: ownerEmail,
    clerkId: await ensureClerkUser(ownerEmail, "owner12345", "Platform", "Owner"),
    firstName: "Platform",
    lastName: "Owner",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
  });

  const agencyId = randomUUID();
  await db.insert(agencies).values({
    id: agencyId,
    name: "Sure Healthcare",
    slug: "sure-healthcare",
    status: "ACTIVE",
    plan: "PRO",
  });

  const adminEmail = "admin@shiftcaredemo.com";
  const admin = {
    id: randomUUID(),
    agencyId,
    email: adminEmail,
    clerkId: await ensureClerkUser(adminEmail, "admin12345", "Alex", "Coordinator"),
    firstName: "Alex",
    lastName: "Coordinator",
    role: "AGENCY_ADMIN",
    status: "ACTIVE",
    phone: "+447700900000",
  };
  await db.insert(users).values(admin);

  const workerUsers = [
    { first: "Jamie", last: "Okoro", email: "jamie@shiftcaredemo.com", postcode: "DN33 2AB", lat: 53.547, lng: -0.085 },
    { first: "Sam", last: "Patel", email: "sam@shiftcaredemo.com", postcode: "DN31 1AA", lat: 53.563, lng: -0.071 },
    { first: "Riley", last: "Khan", email: "riley@shiftcaredemo.com", postcode: "DN37 9DJ", lat: 53.561, lng: -0.149 },
  ];

  for (const w of workerUsers) {
    const uid = randomUUID();
    await db.insert(users).values({
      id: uid,
      agencyId,
      email: w.email,
      clerkId: await ensureClerkUser(w.email, "worker12345", w.first, w.last),
      firstName: w.first,
      lastName: w.last,
      role: "WORKER",
      status: "ACTIVE",
    });
    await db.insert(workers).values({
      id: uid,
      agencyId,
      homePostcode: w.postcode,
      homeLat: w.lat,
      homeLng: w.lng,
      workerTypes: JSON.stringify(["SUPPORT_WORKER", "SENIOR_SUPPORT_WORKER"]),
      drivingLicence: true,
      ownCar: true,
      maxDistanceMiles: 25,
      complianceStatus: "COMPLIANT",
      onboardingStatus: "APPROVED",
    });

    const oneYear = new Date(); oneYear.setFullYear(oneYear.getFullYear() + 1);
    const twoYears = new Date(); twoYears.setFullYear(twoYears.getFullYear() + 2);
    await db.insert(workerDocuments).values({
      id: randomUUID(), workerId: uid, documentType: "DBS_ENHANCED",
      reference: "DBS-" + Math.floor(Math.random() * 1e8),
      issuedDate: new Date(), expiryDate: twoYears, status: "APPROVED",
    });
    await db.insert(workerDocuments).values({
      id: randomUUID(), workerId: uid, documentType: "RIGHT_TO_WORK",
      issuedDate: new Date(), expiryDate: oneYear, status: "APPROVED",
    });
    await db.insert(trainingRecords).values({
      id: randomUUID(), workerId: uid, trainingType: "MANUAL_HANDLING",
      completedDate: new Date(), expiryDate: oneYear,
    });
    await db.insert(trainingRecords).values({
      id: randomUUID(), workerId: uid, trainingType: "MEDICATION_ADMIN",
      completedDate: new Date(), expiryDate: oneYear,
    });
  }

  const clientId = randomUUID();
  await db.insert(clients).values({
    id: clientId, agencyId, name: "NELC", organisationType: "SUPPORTED_LIVING", active: true,
  });

  const locId = randomUUID();
  await db.insert(locations).values({
    id: locId, agencyId, clientId, name: "Angela – Scartho Rd",
    addressLine1: "25 Scartho Rd", city: "Grimsby", postcode: "DN33 2AB",
    latitude: 53.547, longitude: -0.085,
    contactName: "Angela", contactPhone: "+441472000000", active: true,
  });

  const nelcLocations = [
    { name: "495 Cromwell Road", addressLine1: "495 Cromwell Road", city: "Grimsby", postcode: "DN37 9BN", contactName: "Sarah" },
    { name: "Coronations House",  addressLine1: "Coronations House", city: "Grimsby", postcode: "DN32 7QZ", contactName: "Zack" },
    { name: "80 Cambridge Road",  addressLine1: "80 Cambridge Road",  city: "Grimsby", postcode: "DN34 5EA", contactName: "Sarah" },
  ];
  const nelcLocIds: Record<string, string> = {};
  for (const l of nelcLocations) {
    const id = randomUUID();
    nelcLocIds[l.postcode] = id;
    await db.insert(locations).values({
      id, agencyId, clientId, name: l.name,
      addressLine1: l.addressLine1, city: l.city, postcode: l.postcode,
      contactName: l.contactName, active: true,
    });
  }

  const today = new Date();
  const inDays = (n: number) => {
    const d = new Date(today); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const sampleShifts = [
    { date: inDays(2), endDate: inDays(2), startTime: "14:30", endTime: "22:30", overnight: false, type: "LATE", required: 2, raw: "Late", duration: 480, payRate: 12.5, chargeRate: 22 },
    { date: inDays(2), endDate: inDays(3), startTime: "22:30", endTime: "07:30", overnight: true, type: "SLEEP_IN", required: 2, raw: "Sleep", duration: 540, payRate: 50 / 9, chargeRate: 100 / 9 },
    { date: inDays(3), endDate: inDays(3), startTime: "07:30", endTime: "15:00", overnight: false, type: "EARLY", required: 2, raw: "Early", duration: 450, payRate: 12.5, chargeRate: 22 },
    { date: inDays(5), endDate: inDays(5), startTime: "07:00", endTime: "19:00", overnight: false, type: "LONG_DAY", required: 1, raw: "Long Day", duration: 720, payRate: 13, chargeRate: 23 },
  ];

  for (const s of sampleShifts) {
    await db.insert(shifts).values({
      id: randomUUID(), agencyId, clientId, locationId: locId,
      date: s.date, endDate: s.endDate, startTime: s.startTime, endTime: s.endTime,
      overnight: s.overnight, durationMinutes: s.duration,
      shiftType: s.type, shiftTypeRaw: s.raw,
      workerType: "SUPPORT_WORKER", workersRequired: s.required, workersFilled: 0,
      status: "PUBLISHED", assignmentMode: "APPROVAL_REQUIRED",
      payRate: s.payRate, chargeRate: s.chargeRate, requiredTraining: JSON.stringify([]),
      publishedAt: new Date(), createdBy: admin.id,
    });
  }

  const mins = (a: string, b: string, overnight: boolean) => {
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    let m = bh * 60 + bm - (ah * 60 + am);
    if (m <= 0 || overnight) m += 24 * 60;
    return m;
  };
  const siteShifts = [
    { pc: "DN37 9BN", off: 4,  start: "14:30", end: "22:30", overnight: false, type: "LATE",         raw: "Late"  },
    { pc: "DN37 9BN", off: 4,  start: "22:00", end: "08:00", overnight: true,  type: "WAKING_NIGHT", raw: "Night" },
    { pc: "DN37 9BN", off: 5,  start: "07:00", end: "15:00", overnight: false, type: "EARLY",        raw: "Early" },
    { pc: "DN37 9BN", off: 6,  start: "22:00", end: "07:15", overnight: true,  type: "WAKING_NIGHT", raw: "Night" },
    { pc: "DN32 7QZ", off: 2,  start: "20:00", end: "08:00", overnight: true,  type: "WAKING_NIGHT", raw: "Night" },
    { pc: "DN34 5EA", off: 2,  start: "07:30", end: "15:00", overnight: false, type: "EARLY",        raw: "Early" },
    { pc: "DN34 5EA", off: 3,  start: "08:00", end: "14:00", overnight: false, type: "LONG_DAY",     raw: "Days"  },
    { pc: "DN34 5EA", off: 3,  start: "14:30", end: "22:30", overnight: false, type: "LATE",         raw: "Late"  },
    { pc: "DN34 5EA", off: 4,  start: "22:30", end: "07:30", overnight: true,  type: "SLEEP_IN",     raw: "Sleep" },
  ];
  for (const s of siteShifts) {
    const dur = mins(s.start, s.end, s.overnight);
    await db.insert(shifts).values({
      id: randomUUID(), agencyId, clientId, locationId: nelcLocIds[s.pc],
      date: inDays(s.off), endDate: inDays(s.overnight ? s.off + 1 : s.off),
      startTime: s.start, endTime: s.end, overnight: s.overnight, durationMinutes: dur,
      shiftType: s.type, shiftTypeRaw: s.raw,
      workerType: "SUPPORT_WORKER", workersRequired: 2, workersFilled: 0,
      status: "PUBLISHED", assignmentMode: "APPROVAL_REQUIRED",
      payRate: s.type === "SLEEP_IN" ? 50 / 9 : 12.5,
      chargeRate: s.type === "SLEEP_IN" ? 100 / 9 : 22,
      requiredTraining: JSON.stringify([]),
      publishedAt: new Date(), createdBy: admin.id,
    });
  }

  console.log("Seeded.");
  console.log("Super-admin: owner@shiftcaredemo.com / owner12345  →  /platform");
  console.log("Agency admin: admin@shiftcaredemo.com / admin12345");
  console.log("Workers: jamie@shiftcaredemo.com / worker12345 (and sam@/riley@)");
}

