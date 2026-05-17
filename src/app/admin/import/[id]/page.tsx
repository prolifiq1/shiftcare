import { db } from "@/lib/db";
import { importBatches, importRows, importTemplates, shifts, locations, clients } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { requireAdmin, audit } from "@/lib/auth";
import { PageHeader, Card, StatusPill, Banner, Tabs, DataTable, Stat, Field, Button } from "@/lib/ui";
import { notFound, redirect } from "next/navigation";
import { randomUUID } from "crypto";
import type { NormalisedRow, ValidationResult } from "@/lib/import";
import Link from "next/link";

async function publishBatch(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const batchId = String(formData.get("batchId"));
  const batch = db.select().from(importBatches).where(and(eq(importBatches.id, batchId), eq(importBatches.agencyId, user.agencyId))).get();
  if (!batch) redirect("/admin/import");
  const rows = db.select().from(importRows).where(eq(importRows.batchId, batchId)).all();

  let published = 0;
  for (const row of rows) {
    if (row.validationStatus === "FAILED") continue;
    const n: NormalisedRow = JSON.parse(row.normalisedData || "{}");
    if (!n.date || !n.startTime || !n.endTime) continue;

    const clientName = n.client?.trim() || n.provider?.trim() || "Unknown";
    let client = db.select().from(clients).where(and(eq(clients.agencyId, user.agencyId), eq(clients.name, clientName))).get();
    if (!client) {
      const cid = randomUUID();
      db.insert(clients).values({ id: cid, agencyId: user.agencyId, name: clientName, active: true }).run();
      client = db.select().from(clients).where(eq(clients.id, cid)).get()!;
    }

    const locName = n.client || n.address || "Default";
    let location = db
      .select()
      .from(locations)
      .where(and(eq(locations.agencyId, user.agencyId), eq(locations.clientId, client.id), eq(locations.name, locName)))
      .get();
    if (!location) {
      const lid = randomUUID();
      db.insert(locations)
        .values({
          id: lid,
          agencyId: user.agencyId,
          clientId: client.id,
          name: locName,
          addressLine1: n.address?.split(",")[0] ?? null,
          postcode: n.postcode ?? null,
          active: true,
        })
        .run();
      location = db.select().from(locations).where(eq(locations.id, lid)).get()!;
    }

    const shiftId = randomUUID();
    db.insert(shifts)
      .values({
        id: shiftId,
        agencyId: user.agencyId,
        clientId: client.id,
        locationId: location.id,
        importBatchId: batchId,
        date: n.date,
        endDate: n.endDate ?? n.date,
        startTime: n.startTime,
        endTime: n.endTime,
        overnight: n.overnight,
        durationMinutes: n.durationMinutes ?? 0,
        shiftType: n.shiftType ?? "CUSTOM",
        shiftTypeRaw: n.shiftTypeRaw ?? null,
        workerType: n.workerType ?? "SUPPORT_WORKER",
        workersRequired: n.workersRequired || 1,
        workersFilled: 0,
        status: "PUBLISHED",
        assignmentMode: "APPROVAL_REQUIRED",
        payRate: 12.5,
        chargeRate: 22,
        requiredTraining: "[]",
        publishedAt: new Date(),
        createdBy: user.id,
      })
      .run();
    db.update(importRows).set({ mappedShiftId: shiftId, action: "APPROVED" }).where(eq(importRows.id, row.id)).run();
    published++;
  }

  db.update(importBatches).set({ status: "PUBLISHED", publishedRows: published }).where(eq(importBatches.id, batchId)).run();
  audit(user.id, user.agencyId, "import.publish", { type: "importBatch", id: batchId }, { published });
  redirect(`/admin/import/${batchId}?published=${published}`);
}

async function saveTemplate(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const batchId = String(formData.get("batchId"));
  const name = String(formData.get("name") || "").trim();
  if (!name) redirect(`/admin/import/${batchId}?tmpl=name`);

  const batch = db.select().from(importBatches).where(and(eq(importBatches.id, batchId), eq(importBatches.agencyId, user.agencyId))).get();
  if (!batch) redirect("/admin/import");

  // fingerprint from first row's headers
  const sample = db.select().from(importRows).where(eq(importRows.batchId, batchId)).limit(1).all()[0];
  const headers = sample ? Object.keys(JSON.parse(sample.rawData)) : [];
  const { createHash } = await import("crypto");
  const fp = createHash("sha1").update(headers.map((h) => h.trim().toLowerCase()).sort().join("|")).digest("hex").slice(0, 16);

  const id = randomUUID();
  db.insert(importTemplates)
    .values({
      id,
      agencyId: user.agencyId,
      clientId: batch!.clientId ?? null,
      name,
      fingerprint: fp,
      mapping: batch!.mappingJson ?? "{}",
      defaults: null,
      useCount: 1,
      lastUsedAt: new Date(),
      createdBy: user.id,
    })
    .run();
  db.update(importBatches).set({ templateId: id }).where(eq(importBatches.id, batchId)).run();
  audit(user.id, user.agencyId, "importTemplate.create", { type: "importTemplate", id }, { name });
  redirect(`/admin/import/${batchId}?tmpl=ok`);
}

export default async function ImportReview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ published?: string; tmpl?: string; tab?: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab || "all";
  const batch = db.select().from(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.agencyId, user.agencyId))).get();
  if (!batch) notFound();
  const allRows = db.select().from(importRows).where(eq(importRows.batchId, id)).orderBy(importRows.rowNumber).all();
  const rows =
    tab === "all"
      ? allRows
      : allRows.filter((r) =>
          tab === "valid" ? r.validationStatus === "VALID" : tab === "warning" ? r.validationStatus === "WARNING" : r.validationStatus === "FAILED",
        );

  const valid = batch.validRows ?? 0;
  const warn = batch.warningRows ?? 0;
  const failed = batch.failedRows ?? 0;
  const total = batch.totalRows ?? 0;
  const publishable = valid + warn;
  const allFailed = total > 0 && publishable === 0;
  const isPublished = batch.status === "PUBLISHED";

  return (
    <>
      <PageHeader
        breadcrumb={<><a className="h-link" href="/admin/import">Import</a> / <span>{batch.fileName}</span></>}
        title={batch.fileName}
        subtitle={`${total} rows uploaded · ${publishable} ready to publish · ${failed} blocked`}
        action={<StatusPill status={batch.status} />}
      />
      <div className="p-8 space-y-6">
        {sp.published && (
          <Banner tone="ok" title={`Published ${sp.published} shifts`}>
            They’re live in the marketplace now. <Link className="h-link" href="/admin/shifts">View shifts →</Link>
          </Banner>
        )}
        {sp.tmpl === "ok" && <Banner tone="ok" title="Template saved">Future imports with the same headers will reuse this mapping automatically.</Banner>}
        {sp.tmpl === "name" && <Banner tone="danger" title="Template needs a name" />}
        {allFailed && !isPublished && (
          <Banner tone="danger" title="Nothing to publish">
            Every row failed validation. Fix the source spreadsheet and re-upload, or amend the column mapping.
          </Banner>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Total" value={total} />
          <Stat label="Valid" value={valid} hint="Ready" />
          <Stat label="Warning" value={warn} hint="Will publish" />
          <Stat label="Failed" value={failed} hint="Skipped" />
        </div>

        <Tabs
          current={tab}
          tabs={[
            { key: "all", label: "All", href: `/admin/import/${id}?tab=all`, count: total },
            { key: "valid", label: "Valid", href: `/admin/import/${id}?tab=valid`, count: valid },
            { key: "warning", label: "Warnings", href: `/admin/import/${id}?tab=warning`, count: warn },
            { key: "failed", label: "Failed", href: `/admin/import/${id}?tab=failed`, count: failed },
          ]}
        />

        <Card padded={false}>
          <DataTable>
            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
                <th>Date</th>
                <th>Time</th>
                <th>Type</th>
                <th>Client</th>
                <th>Address</th>
                <th>Workers</th>
                <th>Diagnostics</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const n: NormalisedRow = JSON.parse(r.normalisedData || "{}");
                const msgs: ValidationResult["messages"] = JSON.parse(r.validationMessages || "[]");
                const bg =
                  r.validationStatus === "FAILED"
                    ? "color-mix(in srgb, var(--status-danger-bg) 60%, transparent)"
                    : r.validationStatus === "WARNING"
                    ? "color-mix(in srgb, var(--status-warn-bg) 50%, transparent)"
                    : "transparent";
                return (
                  <tr key={r.id} style={{ background: bg }}>
                    <td className="h-num text-xs" style={{ color: "var(--text-muted)" }}>{r.rowNumber}</td>
                    <td><StatusPill status={r.validationStatus} /></td>
                    <td className="h-num">{n.date ?? "—"}</td>
                    <td className="h-num text-xs">
                      {n.startTime ?? "—"}–{n.endTime ?? "—"}
                      {n.overnight && <span className="ml-1" style={{ color: "var(--text-muted)" }}>+1d</span>}
                    </td>
                    <td className="text-xs">
                      <div>{n.shiftType ?? "—"}</div>
                      {n.shiftTypeRaw && <div style={{ color: "var(--text-muted)" }}>“{n.shiftTypeRaw}”</div>}
                    </td>
                    <td>{n.client ?? "—"}</td>
                    <td className="text-xs" style={{ color: "var(--text-secondary)" }}>{n.address ?? "—"}</td>
                    <td className="h-num">{n.workersRequired}</td>
                    <td>
                      {msgs.length === 0 ? (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {msgs.map((m, i) => (
                            <li
                              key={i}
                              className="text-xs"
                              style={{ color: m.level === "ERROR" ? "var(--status-danger-fg)" : "var(--status-warn-fg)" }}
                            >
                              {m.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </Card>

        {!isPublished && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="Publish to marketplace" subtitle={`${publishable} shifts will be created · ${failed} failed rows skipped.`}>
              <form action={publishBatch}>
                <input type="hidden" name="batchId" value={batch.id} />
                <Button type="submit" disabled={allFailed}>
                  Publish {publishable} shifts
                </Button>
              </form>
            </Card>
            <Card title="Save as template" subtitle="Reuse this column mapping for future imports with the same headers.">
              <form action={saveTemplate} className="space-y-3">
                <input type="hidden" name="batchId" value={batch.id} />
                <Field label="Template name" name="name" placeholder="e.g. NELC weekly rota" required />
                <Button variant="secondary" type="submit">Save template</Button>
              </form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
