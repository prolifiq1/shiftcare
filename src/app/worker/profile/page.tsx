import { db } from "@/lib/db";
import { workers, workerDocuments, trainingRecords } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { requireWorker } from "@/lib/auth";
import { Card, Avatar, Chip, Meta, PageHeader, Stat } from "@/lib/ui";

export default async function Profile() {
  const user = await requireWorker();
  const w = db.select().from(workers).where(eq(workers.id, user.id)).get();
  const docs = db.select().from(workerDocuments).where(eq(workerDocuments.workerId, user.id)).all();
  const trainings = db.select().from(trainingRecords).where(eq(trainingRecords.workerId, user.id)).all();
  const types: string[] = JSON.parse(w?.workerTypes || "[]");

  return (
    <>
      <PageHeader
        title={`${user.firstName} ${user.lastName}`}
        subtitle={user.email}
      />
      <div className="p-8 space-y-6 max-w-5xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Reliability" value={w?.reliabilityScore?.toFixed(0) ?? "—"} hint="out of 100" />
          <Stat label="Max distance" value={w?.maxDistanceMiles?.toString() ?? "—"} hint="miles" />
          <Stat label="Postcode" value={w?.homePostcode ?? "—"} />
          <Stat label="Documents" value={docs.length} hint={`${trainings.length} trainings`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card title="About me" subtitle={<Meta items={[w?.drivingLicence ? "Driver" : "No licence", w?.ownCar ? "Own car" : "No car"]} />}>
              <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <Avatar name={`${user.firstName} ${user.lastName}`} className="w-12 h-12 text-base" />
                <div>
                  <div className="font-semibold">{user.firstName} {user.lastName}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>{user.email}</div>
                </div>
              </div>
              {types.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {types.map((t) => (
                    <Chip key={t}>{t.replace(/_/g, " ")}</Chip>
                  ))}
                </div>
              ) : (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>No worker types set.</div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card title="Compliance documents" padded={false}>
              {docs.length === 0 ? (
                <div className="p-5 text-sm" style={{ color: "var(--text-muted)" }}>No documents uploaded.</div>
              ) : (
                <ul>
                  {docs.map((d) => {
                    const days = d.expiryDate ? Math.floor((d.expiryDate.getTime() - Date.now()) / 86400000) : null;
                    const tone =
                      days === null ? "neutral" : days < 0 ? "danger" : days < 30 ? "warn" : "ok";
                    const fg =
                      tone === "danger"
                        ? "var(--status-danger-fg)"
                        : tone === "warn"
                        ? "var(--status-warn-fg)"
                        : tone === "ok"
                        ? "var(--status-ok-fg)"
                        : "var(--text-muted)";
                    return (
                      <li
                        key={d.id}
                        className="flex items-center justify-between px-5 py-3 last:border-0"
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        <div>
                          <div className="text-sm font-medium">{d.documentType.replace(/_/g, " ")}</div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{d.reference}</div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="h-num">Expires {d.expiryDate?.toISOString().slice(0, 10)}</div>
                          {days !== null && (
                            <div className="font-medium h-num" style={{ color: fg }}>
                              {days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Training" padded={false}>
              {trainings.length === 0 ? (
                <div className="p-5 text-sm" style={{ color: "var(--text-muted)" }}>No training records.</div>
              ) : (
                <ul>
                  {trainings.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between px-5 py-3 last:border-0"
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <div className="text-sm">{t.trainingType.replace(/_/g, " ")}</div>
                      <div className="text-xs h-num" style={{ color: "var(--text-muted)" }}>
                        expires {t.expiryDate?.toISOString().slice(0, 10)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
