import { db } from "@/lib/db";
import { documents, users } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getSession, audit, notify } from "@/lib/auth";
import { validateUpload } from "@/lib/upload";
import { rateLimit } from "@/lib/ratelimit";
import { DOC_KINDS, kindLabel } from "@/lib/documents";
import { randomUUID } from "crypto";

const ADMIN_ROLES = ["AGENCY_ADMIN", "COORDINATOR", "COMPLIANCE", "FINANCE", "SUPER_ADMIN"];
const KIND_VALUES = DOC_KINDS.map((k) => k.value as string);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`upload:${session.id}`, 40, 5 * 60_000)) {
    return Response.json({ error: "Too many uploads — try again shortly." }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const rawKind = String(form.get("kind") || "OTHER");
  const kind = KIND_VALUES.includes(rawKind) ? rawKind : "OTHER";
  const label = (String(form.get("label") || "").trim().slice(0, 120)) || null;
  const bookingId = (String(form.get("bookingId") || "").trim()) || null;
  const requestedWorkerId = (String(form.get("workerId") || "").trim()) || null;

  const isAdmin = ADMIN_ROLES.includes(session.role);
  // Workers may only upload for themselves. Admins may upload on behalf of a
  // worker in their own agency (vetted → APPROVED).
  let workerId = session.id;
  let status = "PENDING";
  let onBehalf = false;
  if (requestedWorkerId && requestedWorkerId !== session.id) {
    if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
    const target = await db
      .select()
      .from(users)
      .where(and(eq(users.id, requestedWorkerId), eq(users.agencyId, session.agencyId)))
      .get();
    if (!target) return Response.json({ error: "Worker not found" }, { status: 404 });
    workerId = requestedWorkerId;
    status = "APPROVED";
    onBehalf = true;
  }

  const v = await validateUpload(file);
  if (!v.ok) {
    const msg =
      v.error === "toobig" ? "File too large (max 6 MB)." :
      v.error === "type" ? "Unsupported file — PDF or image only." :
      "No file selected.";
    return Response.json({ error: msg }, { status: 400 });
  }

  const id = randomUUID();
  await db.insert(documents).values({
    id,
    agencyId: session.agencyId,
    workerId,
    uploadedBy: session.id,
    bookingId,
    kind,
    label,
    fileName: v.fileName,
    mimeType: v.mime,
    sizeBytes: v.size,
    contentBase64: v.buf.toString("base64"),
    status,
    reviewedAt: onBehalf ? new Date() : null,
    reviewedBy: onBehalf ? session.id : null,
  }).run();

  if (onBehalf) {
    await audit(session.id, session.agencyId, "document.admin_upload", { type: "document", id }, { kind });
    await notify(workerId, {
      type: "DOCUMENT_ADDED",
      title: "Document added to your file",
      body: `The office added ${kindLabel(kind)} to your records.`,
      href: "/worker/documents",
    });
  } else {
    await audit(session.id, session.agencyId, "document.upload", { type: "document", id }, { kind });
    const admins = (await db.select().from(users).where(eq(users.agencyId, session.agencyId)).all())
      .filter((u) => ["AGENCY_ADMIN", "COORDINATOR", "COMPLIANCE"].includes(u.role));
    for (const a of admins) {
      await notify(a.id, {
        type: "DOCUMENT_UPLOADED",
        title: "New document to review",
        body: `${session.firstName} ${session.lastName} uploaded ${kindLabel(kind)}.`,
        href: "/admin/documents",
      });
    }
  }

  return Response.json({ ok: true, id });
}
