import { db } from "@/lib/db";
import { importBatches, importRows, importTemplates, clients } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin, audit } from "@/lib/auth";
import { PageHeader, Card, StatusPill, EmptyState, DataTable, Banner, Select } from "@/lib/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID, createHash } from "crypto";
import { parseFile, autoDetectMapping, normaliseRow, validateRow } from "@/lib/import";

function fingerprint(headers: string[]): string {
  return createHash("sha1").update(headers.map((h) => h.trim().toLowerCase()).sort().join("|")).digest("hex").slice(0, 16);
}

async function uploadAction(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const file = formData.get("file") as File;
  const clientId = String(formData.get("clientId") || "") || null;
  if (!file || file.size === 0) redirect("/admin/import?error=nofile");
  const buf = Buffer.from(await file.arrayBuffer());
  const rows = parseFile(buf, file.name);
  if (rows.length === 0) redirect("/admin/import?error=empty");

  const headers = Object.keys(rows[0] || {});
  const fp = fingerprint(headers);
  const tmpl = db
    .select()
    .from(importTemplates)
    .where(and(eq(importTemplates.agencyId, user.agencyId), eq(importTemplates.fingerprint, fp)))
    .get();
  const mapping = tmpl ? JSON.parse(tmpl.mapping) : autoDetectMapping(rows);

  const batchId = randomUUID();
  db.insert(importBatches)
    .values({
      id: batchId,
      agencyId: user.agencyId,
      coordinatorId: user.id,
      templateId: tmpl?.id ?? null,
      clientId,
      fileName: file.name,
      format: file.name.toLowerCase().endsWith(".csv") ? "CSV" : "XLSX",
      totalRows: rows.length,
      status: "REVIEW",
      mappingJson: JSON.stringify(mapping),
    })
    .run();

  let valid = 0, warn = 0, fail = 0;
  for (let i = 0; i < rows.length; i++) {
    const normalised = normaliseRow(rows[i], mapping);
    const v = validateRow(normalised);
    if (v.status === "VALID") valid++;
    else if (v.status === "WARNING") warn++;
    else fail++;
    db.insert(importRows)
      .values({
        id: randomUUID(),
        batchId,
        rowNumber: i + 1,
        rawData: JSON.stringify(rows[i]),
        normalisedData: JSON.stringify(normalised),
        validationStatus: v.status,
        validationMessages: JSON.stringify(v.messages),
      })
      .run();
  }
  db.update(importBatches).set({ validRows: valid, warningRows: warn, failedRows: fail }).where(eq(importBatches.id, batchId)).run();

  if (tmpl) {
    db.update(importTemplates)
      .set({ useCount: (tmpl.useCount ?? 0) + 1, lastUsedAt: new Date() })
      .where(eq(importTemplates.id, tmpl.id))
      .run();
  }
  audit(user.id, user.agencyId, "import.upload", { type: "importBatch", id: batchId }, { fileName: file.name, rows: rows.length });
  redirect(`/admin/import/${batchId}`);
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const batches = db
    .select()
    .from(importBatches)
    .where(eq(importBatches.agencyId, user.agencyId))
    .orderBy(desc(importBatches.createdAt))
    .all();
  const templates = db
    .select()
    .from(importTemplates)
    .where(eq(importTemplates.agencyId, user.agencyId))
    .orderBy(desc(importTemplates.useCount))
    .all();
  const cs = db.select().from(clients).where(eq(clients.agencyId, user.agencyId)).all();

  return (
    <>
      <PageHeader title="Import shifts" subtitle="Upload a rota spreadsheet — we map columns automatically and remember client templates." />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {sp.error === "nofile" && <Banner tone="danger" title="Pick a file first">No file was attached.</Banner>}
          {sp.error === "empty" && <Banner tone="danger" title="That file looks empty">No rows could be parsed.</Banner>}

          <Card title="Upload spreadsheet" subtitle="CSV, XLSX, or TSV — up to ~10k rows.">
            <form action={uploadAction} encType="multipart/form-data" className="space-y-4">
              <label
                className="flex items-center justify-center text-center px-6 py-10 rounded-lg cursor-pointer transition-colors"
                style={{
                  border: "2px dashed var(--border-strong)",
                  background: "var(--base-02)",
                }}
              >
                <input type="file" name="file" accept=".csv,.xlsx,.xls,.tsv" required className="sr-only" />
                <div>
                  <div className="text-sm font-medium">Drop a file or click to browse</div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    Auto-detects date, times, NEED slots, shift type · matches saved client templates by header signature
                  </div>
                </div>
              </label>
              <Select label="Client (optional)" name="clientId" defaultValue="">
                <option value="">Leave blank — detect per row</option>
                {cs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <button className="h-btn h-btn-primary" type="submit">Upload &amp; analyse</button>
            </form>
          </Card>

          <Card title="Recent imports" padded={false}>
            {batches.length === 0 ? (
              <div className="p-8"><EmptyState title="No imports yet" body="Upload your first rota to get started." /></div>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Rows</th>
                    <th>Valid</th>
                    <th>Warn</th>
                    <th>Failed</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div className="font-medium">{b.fileName}</div>
                        <div className="text-xs h-num" style={{ color: "var(--text-muted)" }}>
                          {b.createdAt?.toISOString().slice(0, 16).replace("T", " ")}
                        </div>
                      </td>
                      <td className="h-num">{b.totalRows}</td>
                      <td className="h-num" style={{ color: "var(--status-ok-fg)" }}>{b.validRows}</td>
                      <td className="h-num" style={{ color: "var(--status-warn-fg)" }}>{b.warningRows}</td>
                      <td className="h-num" style={{ color: "var(--status-danger-fg)" }}>{b.failedRows}</td>
                      <td><StatusPill status={b.status} /></td>
                      <td className="text-right">
                        <Link className="h-link text-xs" href={`/admin/import/${b.id}`}>Review →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>
        </div>

        <div>
          <Card title="Saved templates" subtitle="Each unique header signature is remembered after a successful import.">
            {templates.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                No templates yet. Publish your first import and we’ll save the column mapping automatically.
              </div>
            ) : (
              <ul className="space-y-3">
                {templates.map((t) => (
                  <li key={t.id} className="flex items-start justify-between pb-3 border-b last:border-0 last:pb-0" style={{ borderColor: "var(--border-subtle)" }}>
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-xs h-num" style={{ color: "var(--text-muted)" }}>
                        used {t.useCount}× · last {t.lastUsedAt?.toISOString().slice(0, 10) ?? "never"}
                      </div>
                    </div>
                    <code className="text-[10px] h-num" style={{ color: "var(--text-muted)" }}>{t.fingerprint?.slice(0, 8)}</code>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
