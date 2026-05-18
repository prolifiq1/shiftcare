import { db } from "@/lib/db";
import { workers, users, workerDocuments, trainingRecords, bookings, shifts, clients, locations } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, Card, Stat, StatusPill, Avatar, Chip, DataTable, EmptyState, Meta } from "@/lib/ui";
import { notFound } from "next/navigation";
import Link from "next/link";

function docTone(expiry: Date | null | undefined): { tone: string; label: string } {
  if (!expiry) return { tone: "var(--text-muted)", label: "No expiry" };
  const days = Math.floor((expiry.getTime() - Date.now()) / 86400000);
  if (days < 0) return { tone: "var(--status-danger-fg)", label: `Expired ${Math.abs(days)}d ago` };
  if (days < 30) return { tone: "var(--status-warn-fg)", label: `${days}d left` };
  return { tone: "var(--status-ok-fg)", label: `${days}d left` };
}

export default async function WorkerDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;

  const u = await db.select().from(users).where(and(eq(users.id, id), eq(users.agencyId, admin.agencyId))).get();
  const w = await db.select().from(workers).where(eq(workers.id, id)).get();
  if (!u || !w) notFound();

  const docs = await db.select().from(workerDocuments).where(eq(workerDocuments.workerId, id)).all();
  const trainings = await db.select().from(trainingRecords).where(eq(trainingRecords.workerId, id)).all();
  const history = await db
    .select({ b: bookings, s: shifts, c: clients, l: locations })
    .from(bookings)
    .leftJoin(shifts, eq(shifts.id, bookings.shiftId))
    .leftJoin(clients, eq(clients.id, shifts.clientId))
    .leftJoin(locations, eq(locations.id, shifts.locationId))
    .where(eq(bookings.workerId, id))
    .orderBy(desc(bookings.requestedAt))
    .all();

  const types: string[] = JSON.parse(w.workerTypes || "[]");
  const now = Date.now();
  const expired = docs.some((d) => d.expiryDate && d.expiryDate.getTime() < now);
  const expiring = docs.some((d) => d.expiryDate && d.expiryDate.getTime() >= now && d.expiryDate.getTime() - now < 30 * 86400000);
  const complianceLabel = expired ? "Expired" : expiring ? "Expiring" : w.complianceStatus === "COMPLIANT" ? "Compliant" : (w.complianceStatus || "Pending");
  const completed = history.filter((h) => ["CHECKED_OUT", "TIMESHEET_SUBMITTED", "TIMESHEET_APPROVED", "PAID", "COMPLETED"].includes(h.b.status)).length;

  return (
    <>
      <PageHeader
        breadcrumb={<><a className="h-link" href="/admin/workers">Workers</a> / <span>{u.firstName} {u.lastName}</span></>}
        title={<span>{u.firstName} {u.lastName}</span>}
        subtitle={<Meta items={[u.email, u.phone, w.homePostcode]} />}
        action={<StatusPill status={w.active ? (expired ? "EXPIRED" : "ACTIVE") : "INACTIVE"} />}
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Reliability" value={`${w.reliabilityScore?.toFixed(0) ?? "—"}`} hint="out of 100" />
          <Stat label="Compliance" value={complianceLabel} />
          <Stat label="Documents" value={docs.length} hint={`${trainings.length} trainings`} />
          <Stat label="Shifts worked" value={completed} hint={`${history.length} bookings`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card title="Profile">
              <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <Avatar name={`${u.firstName} ${u.lastName}`} className="w-12 h-12 text-base" />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{u.firstName} {u.lastName}</div>
                  <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{u.email}</div>
                </div>
              </div>
              <dl className="space-y-3 text-sm">
                <Row k="Phone" v={u.phone || "—"} />
                <Row k="Home postcode" v={w.homePostcode || "—"} mono />
                <Row k="Driving licence" v={w.drivingLicence ? "Yes" : "No"} />
                <Row k="Own car" v={w.ownCar ? "Yes" : "No"} />
                <Row k="Max distance" v={`${w.maxDistanceMiles ?? "—"} mi`} />
                <Row k="Max weekly hours" v={`${w.maxWeeklyHours ?? "—"} h`} />
                <Row k="Onboarding" v={(w.onboardingStatus || "—").replace(/_/g, " ")} />
              </dl>
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div className="h-section-title mb-2">Worker types</div>
                {types.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {types.map((t) => <Chip key={t}>{t.replace(/_/g, " ")}</Chip>)}
                  </div>
                ) : (
                  <div className="text-sm" style={{ color: "var(--text-muted)" }}>None set.</div>
                )}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card title="Compliance documents" padded={false}>
              {docs.length === 0 ? (
                <div className="p-5 text-sm" style={{ color: "var(--text-muted)" }}>No documents on file.</div>
              ) : (
                <DataTable>
                  <thead><tr><th>Document</th><th>Reference</th><th>Issued</th><th>Expires</th><th>Status</th></tr></thead>
                  <tbody>
                    {docs.map((d) => {
                      const t = docTone(d.expiryDate);
                      return (
                        <tr key={d.id}>
                          <td className="font-medium">{d.documentType.replace(/_/g, " ")}</td>
                          <td className="text-xs" style={{ color: "var(--text-muted)" }}>{d.reference || "—"}</td>
                          <td className="h-num text-xs">{d.issuedDate?.toISOString().slice(0, 10) ?? "—"}</td>
                          <td className="h-num text-xs">
                            <div>{d.expiryDate?.toISOString().slice(0, 10) ?? "—"}</div>
                            <div className="font-medium" style={{ color: t.tone }}>{t.label}</div>
                          </td>
                          <td><StatusPill status={d.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              )}
            </Card>

            <Card title="Training" padded={false}>
              {trainings.length === 0 ? (
                <div className="p-5 text-sm" style={{ color: "var(--text-muted)" }}>No training records.</div>
              ) : (
                <DataTable>
                  <thead><tr><th>Training</th><th>Completed</th><th>Expires</th></tr></thead>
                  <tbody>
                    {trainings.map((t) => {
                      const tone = docTone(t.expiryDate);
                      return (
                        <tr key={t.id}>
                          <td className="font-medium">{t.trainingType.replace(/_/g, " ")}</td>
                          <td className="h-num text-xs">{t.completedDate?.toISOString().slice(0, 10) ?? "—"}</td>
                          <td className="h-num text-xs">
                            <span>{t.expiryDate?.toISOString().slice(0, 10) ?? "—"}</span>{" "}
                            <span className="font-medium" style={{ color: tone.tone }}>· {tone.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              )}
            </Card>

            <Card title={`Booking history (${history.length})`} padded={false}>
              {history.length === 0 ? (
                <div className="p-5"><EmptyState title="No bookings yet" body="This worker hasn’t picked up any shifts." /></div>
              ) : (
                <DataTable>
                  <thead><tr><th>Date</th><th>Time</th><th>Client</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {history.map(({ b, s, c, l }) => (
                      <tr key={b.id}>
                        <td className="h-num font-medium">{s?.date ?? "—"}</td>
                        <td className="h-num text-xs">{s ? `${s.startTime}–${s.endTime}` : "—"}</td>
                        <td>
                          <div>{c?.name ?? "—"}</div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{l?.name ?? ""}</div>
                        </td>
                        <td><StatusPill status={b.status} /></td>
                        <td className="text-right">
                          {s && <Link className="h-link text-xs" href={`/admin/shifts/${s.id}`}>Shift →</Link>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b last:border-0 pb-2 last:pb-0" style={{ borderColor: "var(--border-subtle)" }}>
      <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
      <dd className={"font-medium text-right " + (mono ? "h-num" : "")}>{v}</dd>
    </div>
  );
}
