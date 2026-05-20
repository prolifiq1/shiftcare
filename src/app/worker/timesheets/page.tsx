import { db } from "@/lib/db";
import { timesheets, bookings, shifts, clients, documents } from "@/lib/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { requireWorker } from "@/lib/auth";
import { PageHeader, Card, Stat, StatusPill, DataTable, EmptyState, Banner, Money } from "@/lib/ui";
import { Uploader, DeleteDoc } from "@/components/Uploader";
import { humanSize } from "@/lib/documents";
import Link from "next/link";

// Map internal DISPUTED status to a clearer "REJECTED" label for the worker.
function displayStatus(s: string) {
  return s === "DISPUTED" ? "REJECTED" : s;
}

export default async function WorkerTimesheets() {
  const user = await requireWorker();

  // All this worker's timesheets, with shift/client context.
  const rows = await db
    .select({ t: timesheets, s: shifts, c: clients, b: bookings })
    .from(timesheets)
    .leftJoin(bookings, eq(bookings.id, timesheets.bookingId))
    .leftJoin(shifts, eq(shifts.id, bookings.shiftId))
    .leftJoin(clients, eq(clients.id, timesheets.clientId))
    .where(eq(timesheets.workerId, user.id))
    .orderBy(desc(timesheets.submittedAt))
    .all();

  // Worker bookings that have ended (CHECKED_OUT) but no timesheet yet.
  const checkedOut = await db
    .select({ b: bookings, s: shifts, c: clients })
    .from(bookings)
    .leftJoin(shifts, eq(shifts.id, bookings.shiftId))
    .leftJoin(clients, eq(clients.id, shifts.clientId))
    .where(and(eq(bookings.workerId, user.id), inArray(bookings.status, ["CHECKED_OUT"])))
    .all();
  const submittedBookingIds = new Set(rows.map((r) => r.t.bookingId));
  const awaitingSubmit = checkedOut.filter((c) => !submittedBookingIds.has(c.b.id));

  // Documents attached as signed timesheets (kind=TIMESHEET), keyed by bookingId.
  const tsDocs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.workerId, user.id), eq(documents.kind, "TIMESHEET")))
    .all();
  const docByBooking = new Map(tsDocs.filter((d) => d.bookingId).map((d) => [d.bookingId ?? "", d]));
  // Standalone timesheet uploads (not tied to a booking).
  const standaloneUploads = await db
    .select()
    .from(documents)
    .where(and(eq(documents.workerId, user.id), eq(documents.kind, "TIMESHEET"), isNull(documents.bookingId)))
    .orderBy(desc(documents.createdAt))
    .all();

  // Timesheets that need re-submission (rejected by the office).
  const rejected = rows.filter((r) => r.t.status === "DISPUTED");
  const approved = rows.filter((r) => r.t.status === "APPROVED").length;
  const submitted = rows.filter((r) => r.t.status === "SUBMITTED").length;

  return (
    <>
      <PageHeader
        title="Timesheets"
        subtitle={`${rows.length} submitted · ${approved} approved · ${submitted} awaiting review · ${rejected.length} need attention`}
      />
      <div className="p-8 space-y-6 max-w-5xl">
        <Card
          title="Upload a timesheet"
          subtitle="Send a signed timesheet (photo or PDF) to the office for approval. You can also use this for shifts that aren’t in the system."
        >
          <Uploader fixedKind="TIMESHEET" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic" />
        </Card>

        {standaloneUploads.length > 0 && (
          <Card title={`Uploaded timesheet files (${standaloneUploads.length})`} padded={false}>
            <table className="h-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Uploaded</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {standaloneUploads.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <a className="h-link" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">{d.fileName}</a>
                      {d.label && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{d.label}</div>}
                    </td>
                    <td className="h-num text-xs" style={{ color: "var(--text-muted)" }}>{d.createdAt?.toISOString().slice(0, 10)}</td>
                    <td className="h-num text-xs">{humanSize(d.sizeBytes)}</td>
                    <td>
                      <StatusPill status={d.status} />
                      {d.status === "REJECTED" && d.reviewNote && (
                        <div className="text-xs mt-1" style={{ color: "var(--status-danger-fg)" }}>{d.reviewNote}</div>
                      )}
                    </td>
                    <td className="text-right">
                      <DeleteDoc id={d.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Submitted" value={rows.length} />
          <Stat label="Approved" value={approved} />
          <Stat label="Awaiting review" value={submitted} hint="With the office" />
          <Stat label="Needs your attention" value={awaitingSubmit.length + rejected.length} hint={`${awaitingSubmit.length} to submit · ${rejected.length} rejected`} />
        </div>

        {rejected.length > 0 && (
          <Card title="Rejected — please resubmit" padded={false}>
            <ul>
              {rejected.map(({ t, s, c }) => (
                <li
                  key={t.id}
                  className="px-5 py-4 last:border-0"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {c?.name ?? "Shift"} · <span className="h-num">{s?.date}</span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        <span className="h-num">{s?.startTime}–{s?.endTime}</span> · {(t.workedMinutes / 60).toFixed(2)} hrs
                      </div>
                      {t.disputeReason && (
                        <div
                          className="mt-2 text-sm rounded-md px-3 py-2"
                          style={{ background: "var(--status-danger-bg)", color: "var(--status-danger-fg)", border: "1px solid var(--status-danger-border)" }}
                        >
                          <strong>Reason:</strong> {t.disputeReason}
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/worker/timesheets/${t.bookingId}`}
                      className="h-btn h-btn-primary h-btn-sm shrink-0"
                    >
                      Resubmit
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title={`Awaiting your submission (${awaitingSubmit.length})`} padded={false}>
          {awaitingSubmit.length === 0 ? (
            <div className="p-6">
              <EmptyState title="Nothing to submit" body="When you finish a shift it’ll appear here so you can submit your timesheet." />
            </div>
          ) : (
            <ul>
              {awaitingSubmit.map(({ b, s, c }) => (
                <li
                  key={b.id}
                  className="px-5 py-4 flex items-center justify-between gap-4 last:border-0"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <div className="min-w-0">
                    <div className="font-medium">{c?.name ?? "Shift"}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      <span className="h-num">{s?.date}</span> · <span className="h-num">{s?.startTime}–{s?.endTime}</span>
                    </div>
                  </div>
                  <Link href={`/worker/timesheets/${b.id}`} className="h-btn h-btn-primary h-btn-sm shrink-0">
                    Submit timesheet
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`All submissions (${rows.length})`} padded={false}>
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No timesheets yet" body="Your submissions will be listed here." />
            </div>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Hours</th>
                  <th>Pay</th>
                  <th>Status</th>
                  <th>Signed sheet</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, s, c }) => {
                  const doc = docByBooking.get(t.bookingId);
                  return (
                    <tr key={t.id}>
                      <td className="h-num font-medium">{s?.date ?? "—"}</td>
                      <td>{c?.name ?? "—"}</td>
                      <td className="h-num">{(t.workedMinutes / 60).toFixed(2)}</td>
                      <td className="h-num"><Money amount={t.totalPay} /></td>
                      <td>
                        <StatusPill status={displayStatus(t.status)} />
                        {t.status === "DISPUTED" && t.disputeReason && (
                          <div className="text-xs mt-1" style={{ color: "var(--status-danger-fg)" }}>
                            {t.disputeReason}
                          </div>
                        )}
                      </td>
                      <td>
                        {doc ? (
                          <a className="h-link text-xs" href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer">View →</a>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td className="text-right">
                        {t.status === "DISPUTED" || t.status === "SUBMITTED" ? (
                          <Link className="h-link text-xs" href={`/worker/timesheets/${t.bookingId}`}>
                            {t.status === "DISPUTED" ? "Resubmit" : "View / Edit"} →
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </Card>

        {(awaitingSubmit.length === 0 && rows.length === 0) && (
          <Banner tone="info" title="No timesheets yet">
            Once you complete a shift and check out, you’ll be able to submit a timesheet here.
          </Banner>
        )}
      </div>
    </>
  );
}
