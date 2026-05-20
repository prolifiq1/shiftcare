import { db } from "@/lib/db";
import { timesheets, bookings, shifts, users, clients, documents } from "@/lib/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireAdmin, audit, notify } from "@/lib/auth";
import { PageHeader, Tabs, DataTable, EmptyState, Avatar, StatusPill, Button, Money, Card } from "@/lib/ui";
import { humanSize } from "@/lib/documents";
import { redirect } from "next/navigation";

async function approve(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const id = String(formData.get("id"));
  const ts = (await db.select().from(timesheets).where(eq(timesheets.id, id)).get());
  if (!ts) return;
  (await db.update(timesheets).set({ status: "APPROVED", approvedAt: new Date(), approvedBy: user.id }).where(eq(timesheets.id, id)).run());
  (await db.update(bookings).set({ status: "TIMESHEET_APPROVED" }).where(eq(bookings.id, ts.bookingId)).run());
  await audit(user.id, user.agencyId, "timesheet.approve", { type: "timesheet", id });
  await notify(ts.workerId, {
    type: "TIMESHEET_APPROVED",
    title: "Timesheet approved",
    body: `Approved for ${(ts.workedMinutes / 60).toFixed(2)} hrs · £${ts.totalPay?.toFixed(2)}`,
    href: "/worker/schedule",
  });
  redirect("/admin/timesheets");
}

async function dispute(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const id = String(formData.get("id"));
  const reason = (String(formData.get("reason") || "").trim().slice(0, 500)) || "Please review the hours and resubmit.";
  const ts = (await db.select().from(timesheets).where(eq(timesheets.id, id)).get());
  if (!ts) return;
  (await db.update(timesheets).set({ status: "DISPUTED", disputeReason: reason }).where(eq(timesheets.id, id)).run());
  // Re-open the booking so the worker can resubmit cleanly.
  (await db.update(bookings).set({ status: "CHECKED_OUT" }).where(eq(bookings.id, ts.bookingId)).run());
  await audit(user.id, user.agencyId, "timesheet.reject", { type: "timesheet", id }, { reason });
  await notify(ts.workerId, {
    type: "TIMESHEET_REJECTED",
    title: "Timesheet rejected — please resubmit",
    body: reason,
    href: "/worker/timesheets",
  });
  redirect("/admin/timesheets");
}

async function reviewUpload(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  const note = (String(formData.get("note") || "").trim().slice(0, 500)) || null;
  const doc = (await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.agencyId, admin.agencyId))).get());
  if (!doc) redirect("/admin/timesheets");
  const status = decision === "approve" ? "APPROVED" : "REJECTED";
  (await db.update(documents)
    .set({ status, reviewNote: note, reviewedAt: new Date(), reviewedBy: admin.id })
    .where(eq(documents.id, id))
    .run());
  await audit(admin.id, admin.agencyId, `timesheet.upload.${decision}`, { type: "document", id });
  await notify(doc!.workerId, {
    type: status === "APPROVED" ? "TIMESHEET_UPLOAD_APPROVED" : "TIMESHEET_UPLOAD_REJECTED",
    title: status === "APPROVED" ? "Timesheet upload approved" : "Timesheet upload rejected",
    body: status === "APPROVED" ? "Your uploaded timesheet was approved." : (note || "Please re-upload your timesheet."),
    href: "/worker/timesheets",
  });
  redirect("/admin/timesheets");
}

export default async function Timesheets({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab || "submitted";

  const base = (await db
    .select({ t: timesheets, b: bookings, s: shifts, u: users, c: clients })
    .from(timesheets)
    .leftJoin(bookings, eq(bookings.id, timesheets.bookingId))
    .leftJoin(shifts, eq(shifts.id, bookings.shiftId))
    .leftJoin(users, eq(users.id, timesheets.workerId))
    .leftJoin(clients, eq(clients.id, timesheets.clientId))
    .where(eq(timesheets.agencyId, user.agencyId))
    .orderBy(desc(timesheets.submittedAt))
    .all());

  const tsDocs = (await db
    .select()
    .from(documents)
    .where(and(eq(documents.agencyId, user.agencyId), eq(documents.kind, "TIMESHEET")))
    .all());
  const docByBooking = new Map(tsDocs.filter((d) => d.bookingId).map((d) => [d.bookingId ?? "", d.id]));
  // Standalone worker-uploaded timesheets (not tied to a booking).
  const standaloneUploads = (await db
    .select({ d: documents, u: users })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.workerId))
    .where(and(eq(documents.agencyId, user.agencyId), eq(documents.kind, "TIMESHEET"), isNull(documents.bookingId)))
    .orderBy(desc(documents.createdAt))
    .all());
  const pendingUploads = standaloneUploads.filter((r) => r.d.status === "PENDING");

  const filter = (statuses: string[]) => base.filter((r) => statuses.includes(r.t.status));
  const tabs = [
    { key: "submitted", label: "To approve", href: "/admin/timesheets?tab=submitted", count: filter(["SUBMITTED"]).length },
    { key: "approved", label: "Approved", href: "/admin/timesheets?tab=approved", count: filter(["APPROVED"]).length },
    { key: "disputed", label: "Rejected", href: "/admin/timesheets?tab=disputed", count: filter(["DISPUTED"]).length },
    { key: "all", label: "All", href: "/admin/timesheets?tab=all", count: base.length },
  ];
  const groupMap: Record<string, string[]> = {
    submitted: ["SUBMITTED"],
    approved: ["APPROVED"],
    disputed: ["DISPUTED"],
  };
  const rows = tab === "all" ? base : base.filter((r) => (groupMap[tab] || []).includes(r.t.status));

  return (
    <>
      <PageHeader
        title="Timesheets"
        subtitle={`${base.length} hours-based · ${filter(["SUBMITTED"]).length} awaiting approval · ${pendingUploads.length} uploaded file${pendingUploads.length === 1 ? "" : "s"} to review`}
      />

      {standaloneUploads.length > 0 && (
        <div className="px-8 pt-6">
          <Card title={`Worker-uploaded timesheets (${pendingUploads.length} pending)`} padded={false}>
            <DataTable>
              <thead>
                <tr><th>Worker</th><th>File</th><th>Uploaded</th><th>Size</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {standaloneUploads.map(({ d, u }) => (
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
                    <td className="text-xs">
                      <a className="h-link" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">{d.fileName}</a>
                      {d.label && <div style={{ color: "var(--text-muted)" }}>{d.label}</div>}
                    </td>
                    <td className="h-num text-xs" style={{ color: "var(--text-muted)" }}>
                      {d.createdAt?.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="h-num text-xs">{humanSize(d.sizeBytes)}</td>
                    <td>
                      <StatusPill status={d.status} />
                      {d.status === "REJECTED" && d.reviewNote && (
                        <div className="text-xs mt-1" style={{ color: "var(--status-danger-fg)" }}>{d.reviewNote}</div>
                      )}
                    </td>
                    <td className="text-right align-top" style={{ minWidth: 280 }}>
                      {d.status === "PENDING" ? (
                        <div className="inline-flex items-start justify-end gap-2">
                          <form action={reviewUpload}>
                            <input type="hidden" name="id" value={d.id} />
                            <input type="hidden" name="decision" value="approve" />
                            <Button size="sm" type="submit">Approve</Button>
                          </form>
                          <details className="text-left">
                            <summary
                              className="cursor-pointer list-none [&::-webkit-details-marker]:hidden h-btn h-btn-ghost h-btn-sm"
                              style={{ listStyle: "none" }}
                            >
                              Reject…
                            </summary>
                            <form action={reviewUpload} className="mt-2 flex flex-col gap-2 items-end" style={{ minWidth: 260 }}>
                              <input type="hidden" name="id" value={d.id} />
                              <input type="hidden" name="decision" value="reject" />
                              <textarea
                                name="note"
                                rows={2}
                                required
                                maxLength={500}
                                placeholder="Reason for rejection (the worker will see this)"
                                className="h-field h-focus w-full"
                                style={{ minHeight: 64, resize: "vertical", textAlign: "left" }}
                              />
                              <Button size="sm" variant="danger" type="submit">Send rejection</Button>
                            </form>
                          </details>
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
        </div>
      )}

      <div className="px-8 pt-4">
        <Tabs tabs={tabs} current={tab} />
      </div>
      <div className="p-8">
        {rows.length === 0 ? (
          <EmptyState title="Nothing to review" body="Submitted timesheets land here." />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Shift</th>
                <th>Client</th>
                <th>Hours</th>
                <th>Pay</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, s, u, c }) => (
                <tr key={t.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={`${u?.firstName ?? ""} ${u?.lastName ?? ""}`} />
                      <div>
                        <div className="font-medium">{u?.firstName} {u?.lastName}</div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{u?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="h-num">
                    <div>{s?.date}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{s?.startTime}–{s?.endTime}</div>
                  </td>
                  <td>{c?.name}</td>
                  <td className="h-num font-medium">{(t.workedMinutes / 60).toFixed(2)}</td>
                  <td className="h-num"><Money amount={t.totalPay} /></td>
                  <td>
                    <StatusPill status={t.status === "DISPUTED" ? "REJECTED" : t.status} />
                    {docByBooking.get(t.bookingId) && (
                      <a
                        className="h-link text-xs block mt-1"
                        href={`/api/documents/${docByBooking.get(t.bookingId)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View signed sheet →
                      </a>
                    )}
                    {t.status === "DISPUTED" && t.disputeReason && (
                      <div className="text-xs mt-1" style={{ color: "var(--status-danger-fg)" }}>
                        {t.disputeReason}
                      </div>
                    )}
                  </td>
                  <td className="text-right align-top" style={{ minWidth: 280 }}>
                    {t.status === "SUBMITTED" && (
                      <div className="inline-flex items-start justify-end gap-2">
                        <form action={approve}>
                          <input type="hidden" name="id" value={t.id} />
                          <Button size="sm" type="submit">Approve</Button>
                        </form>
                        <details className="text-left">
                          <summary
                            className="cursor-pointer list-none [&::-webkit-details-marker]:hidden h-btn h-btn-ghost h-btn-sm"
                            style={{ listStyle: "none" }}
                          >
                            Reject…
                          </summary>
                          <form action={dispute} className="mt-2 flex flex-col gap-2 items-end" style={{ minWidth: 260 }}>
                            <input type="hidden" name="id" value={t.id} />
                            <textarea
                              name="reason"
                              rows={2}
                              required
                              maxLength={500}
                              placeholder="Reason for rejection (the worker will see this)"
                              className="h-field h-focus w-full"
                              style={{ minHeight: 64, resize: "vertical", textAlign: "left" }}
                            />
                            <Button size="sm" variant="danger" type="submit">Send rejection</Button>
                          </form>
                        </details>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </>
  );
}
