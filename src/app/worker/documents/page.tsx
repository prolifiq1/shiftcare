import { db } from "@/lib/db";
import { documents } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { requireWorker } from "@/lib/auth";
import { PageHeader, Card, StatusPill, EmptyState } from "@/lib/ui";
import { kindLabel, humanSize } from "@/lib/documents";
import { Uploader, DeleteDoc } from "@/components/Uploader";

export default async function WorkerDocuments() {
  const user = await requireWorker();
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.workerId, user.id))
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
        <Card title="Upload a document" subtitle="DBS, right to work, ID, training certificates, etc.">
          <Uploader withMeta />
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
                    <td className="font-medium">
                      {kindLabel(d.kind)}
                      {d.label ? <span className="text-xs" style={{ color: "var(--text-muted)" }}> · {d.label}</span> : null}
                    </td>
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
                      <span className="inline-flex items-center gap-3">
                        <a className="h-link text-xs" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">View →</a>
                        <DeleteDoc id={d.id} />
                      </span>
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
