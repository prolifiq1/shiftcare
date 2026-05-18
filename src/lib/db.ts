import { Pool, Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgSelectBase, PgInsertBase, PgUpdateBase, PgDeleteBase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/*
 * Compatibility shim: the codebase was written against the synchronous
 * better-sqlite3 driver (`.all()` / `.get()` / `.run()`). Postgres drizzle
 * builders are async thenables instead. drizzle composes its builders with
 * `applyMixins` (methods are copied once at load), so we patch each concrete
 * builder prototype directly. Existing call sites then only need an `await`.
 */
type Exec = { execute: () => Promise<unknown> };
for (const C of [PgSelectBase, PgInsertBase, PgUpdateBase, PgDeleteBase]) {
  const proto = (C as unknown as { prototype: Record<string, unknown> }).prototype;
  if (typeof proto.all !== "function") {
    proto.all = function (this: Exec) {
      return this.execute();
    };
  }
  if (typeof proto.get !== "function") {
    proto.get = function (this: Exec) {
      return this.execute().then((r) => (Array.isArray(r) ? r[0] : r));
    };
  }
  if (typeof proto.run !== "function") {
    proto.run = function (this: Exec) {
      return this.execute().then(() => undefined);
    };
  }
}

const connectionString =
  process.env.DATABASE_URL || "postgres://postgres:shiftcare@localhost:5433/shiftcare";

const needsSsl = /\bsslmode=require\b/.test(connectionString) || process.env.PGSSL === "1";

// Reuse the pool across hot reloads / serverless invocations.
const g = globalThis as unknown as { __scPool?: Pool };
export const pool =
  g.__scPool ??
  new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.PG_POOL_MAX || 5),
  });
if (!g.__scPool) g.__scPool = pool;

export const db = drizzle(pool, { schema });

const DDL = `
CREATE TABLE IF NOT EXISTS agencies (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE', plan TEXT DEFAULT 'TRIAL', created_at TIMESTAMP DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  phone TEXT, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE',
  email_verified_at TIMESTAMP, mfa_enabled BOOLEAN DEFAULT false, mfa_secret TEXT, mfa_recovery_codes TEXT,
  last_login_at TIMESTAMP, failed_login_count INTEGER DEFAULT 0, locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL,
  first_name TEXT, last_name TEXT, token TEXT NOT NULL UNIQUE, invited_by TEXT NOT NULL,
  accepted_at TIMESTAMP, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL, used_at TIMESTAMP, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL, used_at TIMESTAMP, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_events (
  id TEXT PRIMARY KEY, user_id TEXT, email TEXT, type TEXT NOT NULL,
  ip TEXT, user_agent TEXT, meta TEXT, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, name TEXT NOT NULL,
  organisation_type TEXT, active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, client_id TEXT NOT NULL, name TEXT NOT NULL,
  address_line1 TEXT, city TEXT, postcode TEXT, latitude REAL, longitude REAL,
  contact_name TEXT, contact_phone TEXT, active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, home_postcode TEXT, home_lat REAL, home_lng REAL,
  worker_types TEXT DEFAULT '[]', driving_licence BOOLEAN DEFAULT false, own_car BOOLEAN DEFAULT false,
  max_distance_miles INTEGER DEFAULT 20, max_weekly_hours INTEGER DEFAULT 48,
  reliability_score REAL DEFAULT 100, compliance_status TEXT DEFAULT 'INCOMPLETE',
  onboarding_status TEXT DEFAULT 'APPROVED', active BOOLEAN DEFAULT true
);
CREATE TABLE IF NOT EXISTS worker_documents (
  id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, document_type TEXT NOT NULL,
  reference TEXT, issued_date TIMESTAMP, expiry_date TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'APPROVED', created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS training_records (
  id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, training_type TEXT NOT NULL,
  completed_date TIMESTAMP, expiry_date TIMESTAMP, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, client_id TEXT NOT NULL, location_id TEXT NOT NULL,
  import_batch_id TEXT, date TEXT NOT NULL, end_date TEXT NOT NULL,
  start_time TEXT NOT NULL, end_time TEXT NOT NULL, overnight BOOLEAN DEFAULT false,
  duration_minutes INTEGER NOT NULL, shift_type TEXT NOT NULL, shift_type_raw TEXT,
  worker_type TEXT NOT NULL, workers_required INTEGER NOT NULL DEFAULT 1,
  workers_filled INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'DRAFT',
  assignment_mode TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  pay_rate REAL, charge_rate REAL, required_training TEXT DEFAULT '[]',
  notes TEXT, created_by TEXT, published_at TIMESTAMP, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, shift_id TEXT NOT NULL, worker_id TEXT NOT NULL, agency_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED', requested_at TIMESTAMP DEFAULT now(),
  approved_at TIMESTAMP, approved_by TEXT, cancelled_at TIMESTAMP, cancellation_reason TEXT,
  check_in_time TIMESTAMP, check_out_time TIMESTAMP, pay_rate_snapshot REAL
);
CREATE TABLE IF NOT EXISTS timesheets (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE, worker_id TEXT NOT NULL,
  agency_id TEXT NOT NULL, client_id TEXT NOT NULL,
  worked_minutes INTEGER NOT NULL, break_minutes INTEGER DEFAULT 0,
  mileage REAL DEFAULT 0, notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  submitted_at TIMESTAMP, approved_at TIMESTAMP, approved_by TEXT,
  dispute_reason TEXT, total_pay REAL,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS import_templates (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, client_id TEXT, name TEXT NOT NULL,
  fingerprint TEXT, mapping TEXT NOT NULL, defaults TEXT,
  use_count INTEGER DEFAULT 0, last_used_at TIMESTAMP, created_by TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, coordinator_id TEXT NOT NULL,
  template_id TEXT, client_id TEXT,
  file_name TEXT NOT NULL, format TEXT NOT NULL,
  total_rows INTEGER DEFAULT 0, valid_rows INTEGER DEFAULT 0, warning_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0, published_rows INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'REVIEW', mapping_json TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, row_number INTEGER NOT NULL,
  raw_data TEXT NOT NULL, normalised_data TEXT, validation_status TEXT NOT NULL,
  validation_messages TEXT, mapped_shift_id TEXT, action TEXT DEFAULT 'PENDING'
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT, href TEXT,
  read_at TIMESTAMP, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, agency_id TEXT, actor_id TEXT, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, meta TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, impersonator_id TEXT, expires_at TIMESTAMP NOT NULL,
  ip TEXT, user_agent TEXT, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, worker_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL, booking_id TEXT, kind TEXT NOT NULL, label TEXT,
  file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  content_base64 TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
  review_note TEXT, reviewed_at TIMESTAMP, reviewed_by TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_agency ON documents(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_worker ON documents(worker_id);
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'TRIAL';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS impersonator_id TEXT;
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_bookings_worker ON bookings(worker_id);
CREATE INDEX IF NOT EXISTS idx_bookings_shift ON bookings(shift_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);
`;

let bootstrapped: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = pool.query(DDL).then(() => undefined);
  }
  return bootstrapped;
}

// Cross-instance-safe one-time seed. Serverless spins up many server
// instances concurrently; a naive "if empty then seed" races and instances
// wipe each other. We serialise with a Postgres advisory lock held on a
// single dedicated connection, and re-check emptiness inside the lock.
const SEED_LOCK_KEY = 873214567;
// Session-level advisory locks don't work through a PgBouncer transaction
// pool (Neon's pooled endpoint), so the lock + emptiness check run on a
// dedicated *direct* connection.
const directUrl =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  connectionString;
let seededOnce: Promise<void> | null = null;
export function ensureSeeded(seedFn: () => Promise<void>): Promise<void> {
  if (!seededOnce) {
    seededOnce = (async () => {
      const client = new Client({
        connectionString: directUrl,
        ssl:
          /\bsslmode=require\b/.test(directUrl) || needsSsl
            ? { rejectUnauthorized: false }
            : undefined,
      });
      await client.connect();
      try {
        await client.query("SELECT pg_advisory_lock($1)", [SEED_LOCK_KEY]);
        const r = await client.query<{ c: number }>(
          "SELECT count(*)::int AS c FROM agencies",
        );
        if ((r.rows[0]?.c ?? 0) === 0) {
          await seedFn();
        }
      } finally {
        await client.end().catch(() => {});
      }
    })();
  }
  return seededOnce;
}
