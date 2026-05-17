// Spreadsheet import engine: parsing, normalisation, validation
import * as XLSX from "xlsx";
import Papa from "papaparse";

export type RawRow = Record<string, unknown>;

export type FieldMapping = {
  provider?: number;
  address?: number;
  client?: number;
  day?: number;
  date?: number;
  workerSlots: number[]; // columns marked "NEED" or worker-name slot
  workerType?: number;
  shiftType?: number;
  startTime?: number;
  endTime?: number;
};

export type NormalisedRow = {
  provider?: string;
  client?: string;
  address?: string;
  postcode?: string;
  date?: string; // YYYY-MM-DD
  endDate?: string;
  startTime?: string; // HH:MM
  endTime?: string;
  overnight: boolean;
  durationMinutes?: number;
  shiftType?: string;
  shiftTypeRaw?: string;
  workerType?: string;
  workersRequired: number;
  preassignedWorkers: string[]; // names found in NEED columns instead of "NEED"
};

export type ValidationResult = {
  status: "VALID" | "WARNING" | "FAILED";
  messages: { level: "ERROR" | "WARNING"; message: string }[];
};

const SHIFT_TYPE_VOCAB: Record<string, string> = {
  LATE: "LATE",
  L: "LATE",
  "LATE SHIFT": "LATE",
  EARLY: "EARLY",
  E: "EARLY",
  AM: "EARLY",
  MORNING: "EARLY",
  SLEEP: "SLEEP_IN",
  "SLEEP IN": "SLEEP_IN",
  "SLEEP-IN": "SLEEP_IN",
  SI: "SLEEP_IN",
  SLEEPOVER: "SLEEP_IN",
  NIGHT: "NIGHT",
  NIGHTS: "NIGHT",
  N: "NIGHT",
  WAKING: "WAKING_NIGHT",
  "WAKING NIGHT": "WAKING_NIGHT",
  "LONG DAY": "LONG_DAY",
  LD: "LONG_DAY",
  TWILIGHT: "TWILIGHT",
};

const WORKER_TYPE_VOCAB: Record<string, string> = {
  SW: "SUPPORT_WORKER",
  "SUPPORT WORKER": "SUPPORT_WORKER",
  "SUPP WORKER": "SUPPORT_WORKER",
  SSW: "SENIOR_SUPPORT_WORKER",
  "SENIOR SUPPORT WORKER": "SENIOR_SUPPORT_WORKER",
  TL: "TEAM_LEADER",
  "TEAM LEADER": "TEAM_LEADER",
  HCA: "HCA",
  RN: "NURSE",
  NURSE: "NURSE",
  PA: "PERSONAL_ASSISTANT",
};

export function parseFile(buffer: Buffer, fileName: string): RawRow[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const text = buffer.toString("utf-8");
    const result = Papa.parse(text, { skipEmptyLines: true });
    return (result.data as string[][]).map(rowToObj);
  }
  // XLSX / XLS
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  return rows.filter((r) => r.some((c) => String(c).trim() !== "")).map(rowToObj);
}

function rowToObj(row: unknown[]): RawRow {
  const obj: RawRow = {};
  row.forEach((v, i) => (obj[`col_${i}`] = v));
  return obj;
}

export function autoDetectMapping(rows: RawRow[]): FieldMapping {
  // Look at first few non-empty rows to infer column purposes
  const sample = rows.slice(0, 10);
  const colCount = Math.max(...sample.map((r) => Object.keys(r).length));
  const mapping: FieldMapping = { workerSlots: [] };

  for (let i = 0; i < colCount; i++) {
    const values = sample
      .map((r) => String(r[`col_${i}`] ?? "").trim())
      .filter((v) => v !== "");
    if (values.length === 0) continue;

    const upper = values.map((v) => v.toUpperCase());
    // Detect "NEED" columns
    if (upper.some((v) => v === "NEED" || v === "REQ" || v === "NEEDED")) {
      mapping.workerSlots.push(i);
      continue;
    }
    // Date column
    if (values.some(looksLikeDate)) {
      mapping.date ??= i;
      continue;
    }
    // Time column
    if (values.every(looksLikeTime)) {
      if (mapping.startTime === undefined) mapping.startTime = i;
      else if (mapping.endTime === undefined) mapping.endTime = i;
      continue;
    }
    // Day name
    if (values.some((v) => /^(mon|tue|wed|thu|fri|sat|sun)/i.test(v))) {
      mapping.day ??= i;
      continue;
    }
    // Shift type
    if (upper.some((v) => v in SHIFT_TYPE_VOCAB)) {
      mapping.shiftType ??= i;
      continue;
    }
    // Worker type
    if (upper.some((v) => v in WORKER_TYPE_VOCAB)) {
      mapping.workerType ??= i;
      continue;
    }
    // Address (contains digits + word like Rd/St/Ave or postcode)
    if (values.some((v) => /\d+.*(rd|road|st|street|ave|avenue|lane|way|close|court)/i.test(v) || ukPostcode(v))) {
      mapping.address ??= i;
      continue;
    }
    // First non-empty text column → provider; second → client
    if (mapping.provider === undefined) mapping.provider = i;
    else if (mapping.client === undefined) mapping.client = i;
  }
  return mapping;
}

function looksLikeDate(v: string): boolean {
  return /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v);
}
function looksLikeTime(v: string): boolean {
  return /^\d{1,2}[:.]\d{2}(\s*[ap]m)?$/i.test(v) || /^\d{3,4}$/.test(v);
}

const UK_POSTCODE_RE = /([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})/i;
function ukPostcode(s: string): string | null {
  const m = s.match(UK_POSTCODE_RE);
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null;
}

export function parseDate(v: string): string | null {
  if (!v) return null;
  v = v.trim();
  // ISO already
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY (UK)
  m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // JS Date parse fallback
  const dt = new Date(v);
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return null;
}

export function parseTime(v: string): string | null {
  if (!v) return null;
  v = v.trim();
  let m = v.match(/^(\d{1,2})[:.](\d{2})\s*([ap]m)?$/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (m[3]) {
      const isPm = m[3].toLowerCase() === "pm";
      if (isPm && h < 12) h += 12;
      if (!isPm && h === 12) h = 0;
    }
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  m = v.match(/^(\d{3,4})$/);
  if (m) {
    const t = m[1].padStart(4, "0");
    const h = parseInt(t.slice(0, 2), 10);
    const min = parseInt(t.slice(2), 10);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return null;
}

export function normaliseRow(raw: RawRow, mapping: FieldMapping): NormalisedRow {
  const get = (idx?: number) => (idx !== undefined ? String(raw[`col_${idx}`] ?? "").trim() : "");

  const provider = get(mapping.provider);
  const client = get(mapping.client);
  const addressRaw = get(mapping.address);
  const postcode = ukPostcode(addressRaw) ?? undefined;
  const date = parseDate(get(mapping.date)) ?? undefined;
  const startTime = parseTime(get(mapping.startTime)) ?? undefined;
  const endTime = parseTime(get(mapping.endTime)) ?? undefined;
  const shiftTypeRaw = get(mapping.shiftType);
  const shiftType = SHIFT_TYPE_VOCAB[shiftTypeRaw.toUpperCase()] ?? (shiftTypeRaw ? "CUSTOM" : undefined);
  const workerTypeRaw = get(mapping.workerType);
  const workerType = WORKER_TYPE_VOCAB[workerTypeRaw.toUpperCase()] ?? workerTypeRaw;

  // Worker slots: count NEED, capture preassigned names
  let workersRequired = 0;
  const preassigned: string[] = [];
  for (const idx of mapping.workerSlots) {
    const v = get(idx);
    if (!v) continue;
    if (/^(need|req|needed)$/i.test(v)) workersRequired++;
    else {
      preassigned.push(v);
      workersRequired++; // slot still counted; just pre-filled
    }
  }
  if (workersRequired === 0 && mapping.workerSlots.length === 0) workersRequired = 1;

  // Overnight
  let overnight = false;
  let endDate = date;
  let durationMinutes: number | undefined;
  if (startTime && endTime && date) {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins <= 0) {
      overnight = true;
      mins += 24 * 60;
      const d = new Date(date + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      endDate = d.toISOString().slice(0, 10);
    }
    durationMinutes = mins;
  }

  return {
    provider: provider || undefined,
    client: client || undefined,
    address: addressRaw || undefined,
    postcode,
    date,
    endDate,
    startTime,
    endTime,
    overnight,
    durationMinutes,
    shiftType,
    shiftTypeRaw: shiftTypeRaw || undefined,
    workerType: workerType || undefined,
    workersRequired,
    preassignedWorkers: preassigned,
  };
}

export function validateRow(n: NormalisedRow): ValidationResult {
  const messages: ValidationResult["messages"] = [];
  if (!n.date) messages.push({ level: "ERROR", message: "Date is missing or unparseable" });
  if (!n.startTime) messages.push({ level: "ERROR", message: "Start time missing" });
  if (!n.endTime) messages.push({ level: "ERROR", message: "End time missing" });
  if (n.durationMinutes !== undefined && n.durationMinutes < 60)
    messages.push({ level: "WARNING", message: `Very short shift (${n.durationMinutes} min)` });
  if (n.durationMinutes !== undefined && n.durationMinutes > 16 * 60 && !n.overnight)
    messages.push({ level: "WARNING", message: `Very long shift (${(n.durationMinutes / 60).toFixed(1)}h)` });
  if (!n.client) messages.push({ level: "WARNING", message: "Client name missing" });
  if (!n.address) messages.push({ level: "WARNING", message: "Address missing" });
  if (!n.shiftType) messages.push({ level: "WARNING", message: "Shift type missing" });
  if (n.shiftType === "CUSTOM")
    messages.push({ level: "WARNING", message: `Shift type '${n.shiftTypeRaw}' not recognised → CUSTOM` });
  if (!n.workersRequired) messages.push({ level: "ERROR", message: "Workers required is 0" });

  const hasErr = messages.some((m) => m.level === "ERROR");
  const hasWarn = messages.some((m) => m.level === "WARNING");
  return { status: hasErr ? "FAILED" : hasWarn ? "WARNING" : "VALID", messages };
}
