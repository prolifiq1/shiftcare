import { db } from "@/lib/db";
import { documents, users } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin, audit, notify } from "@/lib/auth";
import { PageHeader, Tabs, Card, DataTable, EmptyState, StatusPill, Avatar, Button } from "@/lib/ui";
import { kindLabel, humanSize } from "@/lib/documents";
import { redirect } from "next/navigation";

async function review(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  const note = String(formData.get("note") || "") || null;
  const doc = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.agencyId, admin.agencyId))).get();
  if (!doc) redirect("/admin/documents");
  const status = decision === "approve" ? "APPROVED" : "REJECTED";
  await db.update(documents)
    .set({ status, reviewNote: note, reviewedAt: new Date(), reviewedBy: admin.id })
    .where(eq(documents.id, id))
    .run();
  await audit(admin.id, admin.agencyId, `document.${decision}`, { type: "document", id }, { kind: doc!.kind });
  await notify(doc!.workerId, {
    type: status === "APPROVED" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
    title: status === "APPROVED" ? "Document approved" : "Document needs attention",
    body: `${kindLabel(doc!.kind)} — ${status === "APPROVED" ? "approved" : note || "please re-upload"}.`,
    href: "/worker/documents",
  });
  redirect("/admin/documents");
}

export default async function AdminDocuments({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab || "pending";

  const rows = await db
    .select({ d: documents, u: users })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.workerId))
    .where(eq(documents.agencyId, admin.agencyId))
    .orderBy(desc(documents.createdAt))
    .all();

  const filt = (s: string) => rows.filter((r) => r.d.status === s);
  const tabs = [
    { key: "pending", label: "To review", href: "/admin/documents?tab=pending", count: filt("PENDING").length },
    { key: "approved", label: "Approved", href: "/admin/documents?tab=approved", count: filt("APPROVED").length },
    { key: "rejected", label: "Rejected", href: "/admin/documents?tab=rejected", count: filt("REJECTED").length },
    { key: "all", label: "All", href: "/admin/documents?tab=all", count: rows.length },
  ];
  const view = tab === "all" ? rows : rows.filter((r) => r.d.status === tab.toUpperCase());

  return (
    <>
      <PageHeader title="Documents" subtitle={`${filt("PENDING").length} awaiting review`} />
      <div className="px-8 pt-4">
        <Tabs tabs={tabs} current={tab} />
      </div>
      <div className="p-8">
        {view.length === 0 ? (
          <EmptyState title="Nothing here" body="Worker-submitted documents appear here for review." />
        ) : (
          <Card padded={false}>
            <DataTable>
              <thead>
                <tr><th>Worker</th><th>Document</th><th>File</th><th>Uploaded</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {view.map(({ d, u }) => (
                  <tr key={d.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={u ? `${u.firstName} ${u.lastName}` : "—"} />
                        <div>
                          <div className="font-medium">{u ? `${u.firstName} ${u.lastName}` : "Unknown"}</div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{u?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="font-medium">{kindLabel(d.kind)}</div>
                      {d.label && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{d.label}</div>}
                    </td>
                    <td className="text-xs">
                      <a className="h-link" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">{d.fileName}</a>
                      <div style={{ color: "var(--text-muted)" }}>{humanSize(d.sizeBytes)}</div>
                    </td>
                    <td className="h-num text-xs" style={{ color: "var(--text-muted)" }}>{d.createdAt?.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td>
                      <StatusPill status={d.status} />
                      {d.status === "REJECTED" && d.reviewNote && (
                        <div className="text-xs mt-1" style={{ color: "var(--status-danger-fg)" }}>{d.reviewNote}</div>
                      )}
                    </td>
                    <td className="text-right">
                      {d.status === "PENDING" ? (
                        <div className="inline-flex gap-2">
                          <form action={review}>
                            <input type="hidden" name="id" value={d.id} />
                            <input type="hidden" name="decision" value="approve" />
                            <Button size="sm" type="submit">Approve</Button>
                          </form>
                          <form action={review}>
                            <input type="hidden" name="id" value={d.id} />
                            <input type="hidden" name="decision" value="reject" />
                            <input type="hidden" name="note" value="Please re-upload a clearer / valid copy." />
                            <Button size="sm" variant="ghost" type="submit">Reject</Button>
                          </form>
                        </div>
                      ) : (
                        <a className="h-link text-xs" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">View →</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        )}
      </div>
    </>
  );
}
