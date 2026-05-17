import { db } from "@/lib/db";
import { agencies, users, workers, shifts, bookings, clients } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { requireSuperAdmin, startImpersonation, audit } from "@/lib/auth";
import { PageHeader, Stat, DataTable, EmptyState, StatusPill, Chip, Banner } from "@/lib/ui";
import { redirect } from "next/navigation";

async function impersonate(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  await startImpersonation(String(formData.get("agencyId")));
}

async function toggleStatus(formData: FormData) {
  "use server";
  const su = await requireSuperAdmin();
  const id = String(formData.get("agencyId"));
  const next = String(formData.get("next"));
  (await db.update(agencies).set({ status: next }).where(eq(agencies.id, id)).run());
  await audit(su.id, id, next === "SUSPENDED" ? "platform.agency.suspend" : "platform.agency.activate", { type: "agency", id });
  redirect("/platform");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function count(table: any, agencyId: string) {
  const r = (await db
    .select({ c: sql<number>`count(*)` })
    .from(table)
    .where(eq(table.agencyId, agencyId))
    .get());
  return Number((r as { c: number } | undefined)?.c ?? 0);
}

export default async function PlatformHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const all = (await db.select().from(agencies).orderBy(agencies.createdAt).all());
  const tenants = all.filter((a) => a.slug !== "platform");

  const rows = await Promise.all(
    tenants.map(async (a) => ({
      a,
      users: await count(users, a.id),
      workers: await count(workers, a.id),
      shifts: await count(shifts, a.id),
      bookings: await count(bookings, a.id),
      clients: await count(clients, a.id),
    })),
  );

  const totalWorkers = rows.reduce((s, r) => s + r.workers, 0);
  const totalShifts = rows.reduce((s, r) => s + r.shifts, 0);
  const active = tenants.filter((a) => a.status === "ACTIVE").length;

  return (
    <>
      <PageHeader
        title="Agencies"
        subtitle={`${tenants.length} tenants · ${active} active`}
      />
      <div className="p-8 space-y-6">
        {sp.error === "no_admin" && (
          <Banner tone="danger" title="Can’t enter that agency">It has no active agency admin to impersonate.</Banner>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Tenants" value={tenants.length} />
          <Stat label="Active" value={active} hint={`${tenants.length - active} suspended`} />
          <Stat label="Workers" value={totalWorkers} hint="across all tenants" />
          <Stat label="Shifts" value={totalShifts} hint="all time" />
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No tenants yet" body="Agencies will appear here as they sign up." />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Agency</th>
                <th>Plan</th>
                <th>Users</th>
                <th>Workers</th>
                <th>Clients</th>
                <th>Shifts</th>
                <th>Bookings</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, ...m }) => (
                <tr key={a.id}>
                  <td>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs h-num" style={{ color: "var(--text-muted)" }}>
                      {a.createdAt?.toISOString().slice(0, 10)} · {a.slug}
                    </div>
                  </td>
                  <td><Chip>{a.plan}</Chip></td>
                  <td className="h-num">{m.users}</td>
                  <td className="h-num">{m.workers}</td>
                  <td className="h-num">{m.clients}</td>
                  <td className="h-num">{m.shifts}</td>
                  <td className="h-num">{m.bookings}</td>
                  <td><StatusPill status={a.status} /></td>
                  <td className="text-right">
                    <div className="inline-flex gap-2">
                      <form action={impersonate}>
                        <input type="hidden" name="agencyId" value={a.id} />
                        <button className="h-btn h-btn-secondary h-btn-sm" type="submit">Enter →</button>
                      </form>
                      <form action={toggleStatus}>
                        <input type="hidden" name="agencyId" value={a.id} />
                        <input type="hidden" name="next" value={a.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                        <button
                          className="h-btn h-btn-ghost h-btn-sm"
                          type="submit"
                          style={{ color: a.status === "ACTIVE" ? "var(--status-danger-fg)" : "var(--status-ok-fg)" }}
                        >
                          {a.status === "ACTIVE" ? "Suspend" : "Activate"}
                        </button>
                      </form>
                    </div>
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
