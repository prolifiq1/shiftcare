import { pgTable, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey();
const ts = (name: string) => timestamp(name, { mode: "date" }).defaultNow();
const tsNull = (name: string) => timestamp(name, { mode: "date" });

export const agencies = pgTable("agencies", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug"),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED
  plan: text("plan").default("TRIAL"),
  createdAt: ts("created_at"),
});

export const users = pgTable("users", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  role: text("role").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  emailVerifiedAt: tsNull("email_verified_at"),
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaSecret: text("mfa_secret"),
  mfaRecoveryCodes: text("mfa_recovery_codes"),
  lastLoginAt: tsNull("last_login_at"),
  failedLoginCount: integer("failed_login_count").default(0),
  lockedUntil: tsNull("locked_until"),
  createdAt: ts("created_at"),
});

export const invites = pgTable("invites", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  token: text("token").notNull().unique(),
  invitedBy: text("invited_by").notNull(),
  acceptedAt: tsNull("accepted_at"),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: ts("created_at"),
});

export const passwordResets = pgTable("password_resets", {
  id: id(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  usedAt: tsNull("used_at"),
  createdAt: ts("created_at"),
});

export const emailVerifications = pgTable("email_verifications", {
  id: id(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  usedAt: tsNull("used_at"),
  createdAt: ts("created_at"),
});

export const authEvents = pgTable("auth_events", {
  id: id(),
  userId: text("user_id"),
  email: text("email"),
  type: text("type").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  meta: text("meta"),
  createdAt: ts("created_at"),
});

export const clients = pgTable("clients", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  name: text("name").notNull(),
  organisationType: text("organisation_type"),
  active: boolean("active").default(true),
  createdAt: ts("created_at"),
});

export const locations = pgTable("locations", {
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
  active: boolean("active").default(true),
  createdAt: ts("created_at"),
});

export const workers = pgTable("workers", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  homePostcode: text("home_postcode"),
  homeLat: real("home_lat"),
  homeLng: real("home_lng"),
  workerTypes: text("worker_types").default("[]"),
  drivingLicence: boolean("driving_licence").default(false),
  ownCar: boolean("own_car").default(false),
  maxDistanceMiles: integer("max_distance_miles").default(20),
  maxWeeklyHours: integer("max_weekly_hours").default(48),
  reliabilityScore: real("reliability_score").default(100),
  complianceStatus: text("compliance_status").default("INCOMPLETE"),
  onboardingStatus: text("onboarding_status").default("APPROVED"),
  active: boolean("active").default(true),
});

export const workerDocuments = pgTable("worker_documents", {
  id: id(),
  workerId: text("worker_id").notNull(),
  documentType: text("document_type").notNull(),
  reference: text("reference"),
  issuedDate: tsNull("issued_date"),
  expiryDate: tsNull("expiry_date"),
  status: text("status").notNull().default("APPROVED"),
  createdAt: ts("created_at"),
});

export const trainingRecords = pgTable("training_records", {
  id: id(),
  workerId: text("worker_id").notNull(),
  trainingType: text("training_type").notNull(),
  completedDate: tsNull("completed_date"),
  expiryDate: tsNull("expiry_date"),
  createdAt: ts("created_at"),
});

export const shifts = pgTable("shifts", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  clientId: text("client_id").notNull(),
  locationId: text("location_id").notNull(),
  importBatchId: text("import_batch_id"),
  date: text("date").notNull(),
  endDate: text("end_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  overnight: boolean("overnight").default(false),
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
  publishedAt: tsNull("published_at"),
  createdAt: ts("created_at"),
});

export const bookings = pgTable("bookings", {
  id: id(),
  shiftId: text("shift_id").notNull(),
  workerId: text("worker_id").notNull(),
  agencyId: text("agency_id").notNull(),
  status: text("status").notNull().default("REQUESTED"),
  requestedAt: ts("requested_at"),
  approvedAt: tsNull("approved_at"),
  approvedBy: text("approved_by"),
  cancelledAt: tsNull("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  checkInTime: tsNull("check_in_time"),
  checkOutTime: tsNull("check_out_time"),
  payRateSnapshot: real("pay_rate_snapshot"),
});

export const timesheets = pgTable("timesheets", {
  id: id(),
  bookingId: text("booking_id").notNull().unique(),
  workerId: text("worker_id").notNull(),
  agencyId: text("agency_id").notNull(),
  clientId: text("client_id").notNull(),
  workedMinutes: integer("worked_minutes").notNull(),
  breakMinutes: integer("break_minutes").default(0),
  mileage: real("mileage").default(0),
  notes: text("notes"),
  status: text("status").notNull().default("DRAFT"),
  submittedAt: tsNull("submitted_at"),
  approvedAt: tsNull("approved_at"),
  approvedBy: text("approved_by"),
  disputeReason: text("dispute_reason"),
  totalPay: real("total_pay"),
  createdAt: ts("created_at"),
});

export const importTemplates = pgTable("import_templates", {
  id: id(),
  agencyId: text("agency_id").notNull(),
  clientId: text("client_id"),
  name: text("name").notNull(),
  fingerprint: text("fingerprint"),
  mapping: text("mapping").notNull(),
  defaults: text("defaults"),
  useCount: integer("use_count").default(0),
  lastUsedAt: tsNull("last_used_at"),
  createdBy: text("created_by"),
  createdAt: ts("created_at"),
});

export const importBatches = pgTable("import_batches", {
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

export const importRows = pgTable("import_rows", {
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

export const notifications = pgTable("notifications", {
  id: id(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  href: text("href"),
  readAt: tsNull("read_at"),
  createdAt: ts("created_at"),
});

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  agencyId: text("agency_id"),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  meta: text("meta"),
  createdAt: ts("created_at"),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: text("user_id").notNull(),
  impersonatorId: text("impersonator_id"),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: ts("created_at"),
});
