import { db } from "@/lib/db";
import { documents } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireWorker, audit, notify } from "@/lib/auth";
import { users } from "@/lib/schema";
import { PageHeader, Card, StatusPill, EmptyState, Select, Field, Button, Banner } from "@/lib/ui";
import { DOC_KINDS, MAX_UPLOAD_BYTES, kindLabel, humanSize } from "@/lib/documents";
import { validateUpload } from "@/lib/upload";
import { rateLimit } from "@/lib/ratelimit";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";

const KIND_VALUES = DOC_KINDS.map((k) => k.value) as string[];

async function uploadDoc(formData: FormData) {
  "use server";
  const user = await requireWorker();
  if (!rateLimit(`upload:${user.id}`, 20, 5 * 60_000)) {
    redirect("/worker/documents?error=rate");
  }
  const file = formData.get("file") as File | null;
  const rawKind = String(formData.get("kind") || "OTHER");
  const kind = KIND_VALUES.includes(rawKind) ? rawKind : "OTHER";
  const label = (String(formData.get("label") || "").trim().slice(0, 120)) || null;

  const v = await validateUpload(file);
  if (!v.ok) redirect(`/worker/documents?error=${v.error}`);

  await db.insert(documents).values({
    id: randomUUID(),
    agencyId: user.agencyId,
    workerId: user.id,
    uploadedBy: user.id,
    kind,
    label,
    fileName: v.fileName,
    mimeType: v.mime,
    sizeBytes: v.size,
    contentBase64: v.buf.toString("base64"),
    status: "PENDING",
  }).run();
  await audit(user.id, user.agencyId, "document.upload", { type: "document", id: user.id }, { kind });

  // Notify agency admins/coordinators.
  const admins = (await db.select().from(users).where(eq(users.agencyId, user.agencyId)).all())
    .filter((u) => ["AGENCY_ADMIN", "COORDINATOR", "COMPLIANCE"].includes(u.role));
  for (const a of admins) {
    await notify(a.id, {
      type: "DOCUMENT_UPLOADED",
      title: "New document to review",
      body: `${user.firstName} ${user.lastName} uploaded ${kindLabel(kind)}.`,
      href: "/admin/documents",
    });
  }
  redirect("/worker/documents?ok=1");
}

export default async function WorkerDocuments({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireWorker();
  const sp = await searchParams;
  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.workerId, user.id)))
    .orderBy(desc(documents.createdAt))
    .all();

  const pending = docs.filter((d) => d.status === "PENDING").length;
  const approved = docs.filter((d) => d.status === "APPROVED").length;

  return (
    <>
      <PageHeader
        title="My documents"
        subtitle={`${docs.length} files · ${approved} approved · ${pending} awaiting review`}
      />
      <div className="p-8 space-y-6 max-w-4xl">
        {sp.ok && <Banner tone="ok" title="Uploaded">Your document was sent to the office for review.</Banner>}
        {sp.error === "nofile" && <Banner tone="danger" title="No file selected">Pick a file to upload.</Banner>}
        {sp.error === "toobig" && <Banner tone="danger" title="File too large">Maximum size is {humanSize(MAX_UPLOAD_BYTES)}.</Banner>}
        {sp.error === "type" && <Banner tone="danger" title="Unsupported file">Only PDF or image files (PDF, JPG, PNG, WEBP, HEIC) are allowed.</Banner>}
        {sp.error === "rate" && <Banner tone="danger" title="Too many uploads">Please wait a few minutes and try again.</Banner>}

        <Card title="Upload a document" subtitle="DBS, right to work, ID, training certificates, etc.">
          <form action={uploadDoc} encType="multipart/form-data" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Document type" name="kind" defaultValue="DBS_ENHANCED">
                {DOC_KINDS.filter((k) => k.value !== "TIMESHEET").map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </Select>
              <Field label="Label / reference (optional)" name="label" placeholder="e.g. DBS cert no." />
            </div>
            <div>
              <label className="h-label">File</label>
              <input
                type="file"
                name="file"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx"
                className="block w-full text-sm"
              />
              <div className="h-help">PDF or image, up to {humanSize(MAX_UPLOAD_BYTES)}.</div>
            </div>
            <Button type="submit">Upload for review</Button>
          </form>
        </Card>

        <Card title="Submitted documents" padded={false}>
          {docs.length === 0 ? (
            <div className="p-6"><EmptyState title="Nothing uploaded yet" body="Upload your compliance documents above." /></div>
          ) : (
            <table className="h-table">
              <thead><tr><th>Type</th><th>File</th><th>Size</th><th>Uploaded</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{kindLabel(d.kind)}{d.label ? <span className="text-xs" style={{ color: "var(--text-muted)" }}> · {d.label}</span> : null}</td>
                    <td className="text-xs">{d.fileName}</td>
                    <td className="h-num text-xs">{humanSize(d.sizeBytes)}</td>
                    <td className="h-num text-xs" style={{ color: "var(--text-muted)" }}>{d.createdAt?.toISOString().slice(0, 10)}</td>
                    <td>
                      <StatusPill status={d.status} />
                      {d.status === "REJECTED" && d.reviewNote && (
                        <div className="text-xs mt-1" style={{ color: "var(--status-danger-fg)" }}>{d.reviewNote}</div>
                      )}
                    </td>
                    <td className="text-right">
                      <a className="h-link text-xs" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">View →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
