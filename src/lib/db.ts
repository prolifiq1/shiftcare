import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const dbPath = process.env.DB_PATH || path.join(process.cwd(), "shiftcare.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };

sqlite.exec(`
CREATE TABLE IF NOT EXISTS agencies (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT, created_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  phone TEXT, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE',
  email_verified_at INTEGER, mfa_enabled INTEGER DEFAULT 0, mfa_secret TEXT, mfa_recovery_codes TEXT,
  last_login_at INTEGER, failed_login_count INTEGER DEFAULT 0, locked_until INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL,
  first_name TEXT, last_name TEXT, token TEXT NOT NULL UNIQUE, invited_by TEXT NOT NULL,
  accepted_at INTEGER, expires_at INTEGER NOT NULL, created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS auth_events (
  id TEXT PRIMARY KEY, user_id TEXT, email TEXT, type TEXT NOT NULL,
  ip TEXT, user_agent TEXT, meta TEXT, created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, name TEXT NOT NULL,
  organisation_type TEXT, active INTEGER DEFAULT 1, created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, client_id TEXT NOT NULL, name TEXT NOT NULL,
  address_line1 TEXT, city TEXT, postcode TEXT, latitude REAL, longitude REAL,
  contact_name TEXT, contact_phone TEXT, active INTEGER DEFAULT 1, created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, home_postcode TEXT, home_lat REAL, home_lng REAL,
  worker_types TEXT DEFAULT '[]', driving_licence INTEGER DEFAULT 0, own_car INTEGER DEFAULT 0,
  max_distance_miles INTEGER DEFAULT 20, max_weekly_hours INTEGER DEFAULT 48,
  reliability_score REAL DEFAULT 100, compliance_status TEXT DEFAULT 'INCOMPLETE',
  onboarding_status TEXT DEFAULT 'APPROVED', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS worker_documents (
  id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, document_type TEXT NOT NULL,
  reference TEXT, issued_date INTEGER, expiry_date INTEGER,
  status TEXT NOT NULL DEFAULT 'APPROVED', created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS training_records (
  id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, training_type TEXT NOT NULL,
  completed_date INTEGER, expiry_date INTEGER, created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, client_id TEXT NOT NULL, location_id TEXT NOT NULL,
  import_batch_id TEXT, date TEXT NOT NULL, end_date TEXT NOT NULL,
  start_time TEXT NOT NULL, end_time TEXT NOT NULL, overnight INTEGER DEFAULT 0,
  duration_minutes INTEGER NOT NULL, shift_type TEXT NOT NULL, shift_type_raw TEXT,
  worker_type TEXT NOT NULL, workers_required INTEGER NOT NULL DEFAULT 1,
  workers_filled INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'DRAFT',
  assignment_mode TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  pay_rate REAL, charge_rate REAL, required_training TEXT DEFAULT '[]',
  notes TEXT, created_by TEXT, published_at INTEGER, created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, shift_id TEXT NOT NULL, worker_id TEXT NOT NULL, agency_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED', requested_at INTEGER DEFAULT (unixepoch()),
  approved_at INTEGER, approved_by TEXT, cancelled_at INTEGER, cancellation_reason TEXT,
  check_in_time INTEGER, check_out_time INTEGER, pay_rate_snapshot REAL
);
CREATE TABLE IF NOT EXISTS timesheets (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE, worker_id TEXT NOT NULL,
  agency_id TEXT NOT NULL, client_id TEXT NOT NULL,
  worked_minutes INTEGER NOT NULL, break_minutes INTEGER DEFAULT 0,
  mileage REAL DEFAULT 0, notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  submitted_at INTEGER, approved_at INTEGER, approved_by TEXT,
  dispute_reason TEXT, total_pay REAL,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS import_templates (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, client_id TEXT, name TEXT NOT NULL,
  fingerprint TEXT, mapping TEXT NOT NULL, defaults TEXT,
  use_count INTEGER DEFAULT 0, last_used_at INTEGER, created_by TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, coordinator_id TEXT NOT NULL,
  template_id TEXT, client_id TEXT,
  file_name TEXT NOT NULL, format TEXT NOT NULL,
  total_rows INTEGER DEFAULT 0, valid_rows INTEGER DEFAULT 0, warning_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0, published_rows INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'REVIEW', mapping_json TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, row_number INTEGER NOT NULL,
  raw_data TEXT NOT NULL, normalised_data TEXT, validation_status TEXT NOT NULL,
  validation_messages TEXT, mapped_shift_id TEXT, action TEXT DEFAULT 'PENDING'
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT, href TEXT,
  read_at INTEGER, created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, agency_id TEXT, actor_id TEXT, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, meta TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
  ip TEXT, user_agent TEXT, created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_bookings_worker ON bookings(worker_id);
CREATE INDEX IF NOT EXISTS idx_bookings_shift ON bookings(shift_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);
`);

// Best-effort migrations for existing DBs
try { sqlite.exec(`ALTER TABLE users ADD COLUMN email_verified_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE users ADD COLUMN mfa_secret TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE users ADD COLUMN mfa_recovery_codes TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE users ADD COLUMN last_login_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE users ADD COLUMN failed_login_count INTEGER DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE users ADD COLUMN locked_until INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN ip TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN user_agent TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE import_batches ADD COLUMN template_id TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE import_batches ADD COLUMN client_id TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE agencies ADD COLUMN slug TEXT`); } catch {}
