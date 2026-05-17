import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey();
const ts = (name: string) =>
  integer(name, { mode: "timestamp" }).default(sql`(unixepoch())`);

export const agencies = sqliteTable("agencies", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug"),
  createdAt: ts("created_at"),
});

export const users = sqliteTable("users", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  role: text("role").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  emailVerifiedAt: integer("email_verified_at", { mode: "timestamp" }),
  mfaEnabled: integer("mfa_enabled", { mode: "boolean" }).default(false),
  mfaSecret: text("mfa_secret"),
  mfaRecoveryCodes: text("mfa_recovery_codes"),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  failedLoginCount: integer("failed_login_count").default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp" }),
  createdAt: ts("created_at"),
});

export const invites = sqliteTable("invites", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  token: text("token").notNull().unique(),
  invitedBy: text("invited_by").notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: ts("created_at"),
});

export const passwordResets = sqliteTable("password_resets", {
  id: id(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: ts("created_at"),
});

export const emailVerifications = sqliteTable("email_verifications", {
  id: id(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: ts("created_at"),
});

export const authEvents = sqliteTable("auth_events", {
  id: id(),
  userId: text("user_id"),
  email: text("email"),
  type: text("type").notNull(), // LOGIN_OK, LOGIN_FAIL, MFA_OK, MFA_FAIL, PWD_RESET_REQ, INVITE_ACCEPT, LOGOUT, LOCKED
  ip: text("ip"),
  userAgent: text("user_agent"),
  meta: text("meta"),
  createdAt: ts("created_at"),
});

export const clients = sqliteTable("clients", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  name: text("name").notNull(),
  organisationType: text("organisation_type"),
  active: integer("active", { mode: "boolean" }).default(true),
  createdAt: ts("created_at"),
});

export const locations = sqliteTable("locations", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  clientId: text("client_id").notNull(),
  name: text("name").notNull(),
  addressLine1: text("address_line1"),
  city: text("city"),
  postcode: text("postcode"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  active: integer("active", { mode: "boolean" }).default(true),
  createdAt: ts("created_at"),
});

export const workers = sqliteTable("workers", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  homePostcode: text("home_postcode"),
  homeLat: real("home_lat"),
  homeLng: real("home_lng"),
  workerTypes: text("worker_types").default("[]"),
  drivingLicence: integer("driving_licence", { mode: "boolean" }).default(false),
  ownCar: integer("own_car", { mode: "boolean" }).default(false),
  maxDistanceMiles: integer("max_distance_miles").default(20),
  maxWeeklyHours: integer("max_weekly_hours").default(48),
  reliabilityScore: real("reliability_score").default(100),
  complianceStatus: text("compliance_status").default("INCOMPLETE"),
  onboardingStatus: text("onboarding_status").default("APPROVED"),
  active: integer("active", { mode: "boolean" }).default(true),
});

export const workerDocuments = sqliteTable("worker_documents", {
  id: id(),
  workerId: text("worker_id").notNull(),
  documentType: text("document_type").notNull(),
  reference: text("reference"),
  issuedDate: integer("issued_date", { mode: "timestamp" }),
  expiryDate: integer("expiry_date", { mode: "timestamp" }),
  status: text("status").notNull().default("APPROVED"),
  createdAt: ts("created_at"),
});

export const trainingRecords = sqliteTable("training_records", {
  id: id(),
  workerId: text("worker_id").notNull(),
  trainingType: text("training_type").notNull(),
  completedDate: integer("completed_date", { mode: "timestamp" }),
  expiryDate: integer("expiry_date", { mode: "timestamp" }),
  createdAt: ts("created_at"),
});

export const shifts = sqliteTable("shifts", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  clientId: text("client_id").notNull(),
  locationId: text("location_id").notNull(),
  importBatchId: text("import_batch_id"),
  date: text("date").notNull(),
  endDate: text("end_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  overnight: integer("overnight", { mode: "boolean" }).default(false),
  durationMinutes: integer("duration_minutes").notNull(),
  shiftType: text("shift_type").notNull(),
  shiftTypeRaw: text("shift_type_raw"),
  workerType: text("worker_type").notNull(),
  workersRequired: integer("workers_required").notNull().default(1),
  workersFilled: integer("workers_filled").notNull().default(0),
  status: text("status").notNull().default("DRAFT"),
  assignmentMode: text("assignment_mode").notNull().default("APPROVAL_REQUIRED"),
  payRate: real("pay_rate"),
  chargeRate: real("charge_rate"),
  requiredTraining: text("required_training").default("[]"),
  notes: text("notes"),
  createdBy: text("created_by"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: ts("created_at"),
});

export const bookings = sqliteTable("bookings", {
  id: id(),
  shiftId: text("shift_id").notNull(),
  workerId: text("worker_id").notNull(),
  agencyId: text("agency_id").notNull(),
  status: text("status").notNull().default("REQUESTED"),
  requestedAt: ts("requested_at"),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  approvedBy: text("approved_by"),
  cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
  cancellationReason: text("cancellation_reason"),
  checkInTime: integer("check_in_time", { mode: "timestamp" }),
  checkOutTime: integer("check_out_time", { mode: "timestamp" }),
  payRateSnapshot: real("pay_rate_snapshot"),
});

export const timesheets = sqliteTable("timesheets", {
  id: id(),
  bookingId: text("booking_id").notNull().unique(),
  workerId: text("worker_id").notNull(),
  agencyId: text("agency_id").notNull(),
  clientId: text("client_id").notNull(),
  workedMinutes: integer("worked_minutes").notNull(),
  breakMinutes: integer("break_minutes").default(0),
  mileage: real("mileage").default(0),
  notes: text("notes"),
  status: text("status").notNull().default("DRAFT"), // DRAFT | SUBMITTED | APPROVED | DISPUTED
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  approvedBy: text("approved_by"),
  disputeReason: text("dispute_reason"),
  totalPay: real("total_pay"),
  createdAt: ts("created_at"),
});

export const importTemplates = sqliteTable("import_templates", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  clientId: text("client_id"),
  name: text("name").notNull(),
  fingerprint: text("fingerprint"), // header hash
  mapping: text("mapping").notNull(), // JSON
  defaults: text("defaults"), // JSON
  useCount: integer("use_count").default(0),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  createdBy: text("created_by"),
  createdAt: ts("created_at"),
});

export const importBatches = sqliteTable("import_batches", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  coordinatorId: text("coordinator_id").notNull(),
  templateId: text("template_id"),
  clientId: text("client_id"),
  fileName: text("file_name").notNull(),
  format: text("format").notNull(),
  totalRows: integer("total_rows").default(0),
  validRows: integer("valid_rows").default(0),
  warningRows: integer("warning_rows").default(0),
  failedRows: integer("failed_rows").default(0),
  publishedRows: integer("published_rows").default(0),
  status: text("status").notNull().default("REVIEW"),
  mappingJson: text("mapping_json"),
  createdAt: ts("created_at"),
});

export const importRows = sqliteTable("import_rows", {
  id: id(),
  batchId: text("batch_id").notNull(),
  rowNumber: integer("row_number").notNull(),
  rawData: text("raw_data").notNull(),
  normalisedData: text("normalised_data"),
  validationStatus: text("validation_status").notNull(),
  validationMessages: text("validation_messages"),
  mappedShiftId: text("mapped_shift_id"),
  action: text("action").default("PENDING"),
});

export const notifications = sqliteTable("notifications", {
  id: id(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  href: text("href"),
  readAt: integer("read_at", { mode: "timestamp" }),
  createdAt: ts("created_at"),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: id(),
  agencyId: text("agency_id"),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  meta: text("meta"),
  createdAt: ts("created_at"),
});

export const sessions = sqliteTable("sessions", {
  id: id(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: ts("created_at"),
});
