// Server-side upload hardening: size, extension + MIME allowlist, and a
// magic-byte sniff so a renamed executable can't pass as a PDF/image.

import { MAX_UPLOAD_BYTES } from "./documents";

const ALLOWED: Record<string, { ext: string[]; sniff: (b: Buffer) => boolean }> = {
  "application/pdf": {
    ext: ["pdf"],
    sniff: (b) => b.slice(0, 5).toString("latin1") === "%PDF-",
  },
  "image/jpeg": {
    ext: ["jpg", "jpeg"],
    sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  "image/png": {
    ext: ["png"],
    sniff: (b) => b.slice(0, 8).toString("hex") === "89504e470d0a1a0a",
  },
  "image/webp": {
    ext: ["webp"],
    sniff: (b) => b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP",
  },
  "image/heic": {
    ext: ["heic", "heif"],
    sniff: (b) => b.slice(4, 8).toString("latin1") === "ftyp",
  },
};

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "file";
  return base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "file";
}

export type UploadResult =
  | { ok: true; buf: Buffer; mime: string; fileName: string; size: number }
  | { ok: false; error: "nofile" | "toobig" | "type" };

export async function validateUpload(file: File | null): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, error: "nofile" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "toobig" };

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  // Find an allowed type whose magic bytes match the actual content.
  for (const [mime, def] of Object.entries(ALLOWED)) {
    if (def.sniff(buf)) {
      // content matches a known-good type; also require a sane extension
      if (!def.ext.includes(ext)) continue;
      return { ok: true, buf, mime, fileName: sanitizeFileName(file.name), size: file.size };
    }
  }
  return { ok: false, error: "type" };
}
