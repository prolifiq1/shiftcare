import { db } from "../src/lib/db";
import {
  agencies,
  users,
  clients,
  locations,
  workers,
  workerDocuments,
  trainingRecords,
  shifts,
} from "../src/lib/schema";
import { hashPassword } from "../src/lib/auth";
import { randomUUID } from "crypto";

console.log("Seeding...");

// Wipe (idempotent)
db.delete(shifts).run();
db.delete(workerDocuments).run();
db.delete(trainingRecords).run();
db.delete(workers).run();
db.delete(locations).run();
db.delete(clients).run();
db.delete(users).run();
db.delete(agencies).run();

const agencyId = randomUUID();
db.insert(agencies).values({ id: agencyId, name: "Sure Healthcare" }).run();

// Users
const admin = {
  id: randomUUID(),
  agencyId,
  email: "admin@sure.test",
  passwordHash: hashPassword("admin123"),
  firstName: "Alex",
  lastName: "Coordinator",
  role: "AGENCY_ADMIN",
  status: "ACTIVE",
  phone: "+447700900000",
};
db.insert(users).values(admin).run();

const workerUsers = [
  { first: "Jamie", last: "Okoro", email: "jamie@sure.test", postcode: "DN33 2AB", lat: 53.547, lng: -0.085 },
  { first: "Sam", last: "Patel", email: "sam@sure.test", postcode: "DN31 1AA", lat: 53.563, lng: -0.071 },
  { first: "Riley", last: "Khan", email: "riley@sure.test", postcode: "DN37 9DJ", lat: 53.561, lng: -0.149 },
];

for (const w of workerUsers) {
  const uid = randomUUID();
  db.insert(users).values({
    id: uid,
    agencyId,
    email: w.email,
    passwordHash: hashPassword("worker123"),
    firstName: w.first,
    lastName: w.last,
    role: "WORKER",
    status: "ACTIVE",
  }).run();
  db.insert(workers).values({
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
  }).run();

  // Compliance documents (DBS + RTW current)
  const oneYear = new Date(); oneYear.setFullYear(oneYear.getFullYear() + 1);
  const twoYears = new Date(); twoYears.setFullYear(twoYears.getFullYear() + 2);
  db.insert(workerDocuments).values({
    id: randomUUID(), workerId: uid, documentType: "DBS_ENHANCED",
    reference: "DBS-" + Math.floor(Math.random() * 1e8),
    issuedDate: new Date(), expiryDate: twoYears, status: "APPROVED",
  }).run();
  db.insert(workerDocuments).values({
    id: randomUUID(), workerId: uid, documentType: "RIGHT_TO_WORK",
    issuedDate: new Date(), expiryDate: oneYear, status: "APPROVED",
  }).run();
  db.insert(trainingRecords).values({
    id: randomUUID(), workerId: uid, trainingType: "MANUAL_HANDLING",
    completedDate: new Date(), expiryDate: oneYear,
  }).run();
  db.insert(trainingRecords).values({
    id: randomUUID(), workerId: uid, trainingType: "MEDICATION_ADMIN",
    completedDate: new Date(), expiryDate: oneYear,
  }).run();
}

// Client + Location
const clientId = randomUUID();
db.insert(clients).values({
  id: clientId, agencyId, name: "NELC", organisationType: "SUPPORTED_LIVING", active: true,
}).run();

const locId = randomUUID();
db.insert(locations).values({
  id: locId, agencyId, clientId, name: "Angela – Scartho Rd",
  addressLine1: "25 Scartho Rd", city: "Grimsby", postcode: "DN33 2AB",
  latitude: 53.547, longitude: -0.085,
  contactName: "Angela", contactPhone: "+441472000000", active: true,
}).run();

// Additional NELC supported-living sites (from client rota spreadsheets)
const nelcLocations = [
  { name: "495 Cromwell Road", addressLine1: "495 Cromwell Road", city: "Grimsby", postcode: "DN37 9BN", contactName: "Sarah" },
  { name: "Coronations House",  addressLine1: "Coronations House", city: "Grimsby", postcode: "DN32 7QZ", contactName: "Zack" },
  { name: "80 Cambridge Road",  addressLine1: "80 Cambridge Road",  city: "Grimsby", postcode: "DN34 5EA", contactName: "Sarah" },
];
const nelcLocIds: Record<string, string> = {};
for (const l of nelcLocations) {
  const id = randomUUID();
  nelcLocIds[l.postcode] = id;
  db.insert(locations).values({
    id, agencyId, clientId, name: l.name,
    addressLine1: l.addressLine1, city: l.city, postcode: l.postcode,
    contactName: l.contactName, active: true,
  }).run();
}

// Sample published shifts (matching the spreadsheet example)
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
  db.insert(shifts).values({
    id: randomUUID(), agencyId, clientId, locationId: locId,
    date: s.date, endDate: s.endDate, startTime: s.startTime, endTime: s.endTime,
    overnight: s.overnight, durationMinutes: s.duration,
    shiftType: s.type, shiftTypeRaw: s.raw,
    workerType: "SUPPORT_WORKER", workersRequired: s.required, workersFilled: 0,
    status: "PUBLISHED", assignmentMode: "APPROVAL_REQUIRED",
    payRate: s.payRate, chargeRate: s.chargeRate, requiredTraining: JSON.stringify([]),
    publishedAt: new Date(), createdBy: admin.id,
  }).run();
}

// Published shifts at the NELC sites (mirroring the rota spreadsheets)
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
  db.insert(shifts).values({
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
  }).run();
}

console.log("Seeded.");
console.log("Admin login: admin@sure.test / admin123");
console.log("Worker logins: jamie@sure.test / worker123 (and sam@/riley@)");
process.exit(0);
