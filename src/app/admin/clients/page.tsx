import { db } from "@/lib/db";
import { clients, locations, shifts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, Card, EmptyState, LinkButton, Meta } from "@/lib/ui";

export default async function ClientsList() {
  const user = await requireAdmin();
  const cs = (await db.select().from(clients).where(eq(clients.agencyId, user.agencyId)).all());
  const allLocations = (await db.select().from(locations).where(eq(locations.agencyId, user.agencyId)).all());
  const allShifts = (await db.select().from(shifts).where(eq(shifts.agencyId, user.agencyId)).all());

  return (
    <>
      <PageHeader
        title="Clients & locations"
        subtitle={`${cs.length} clients · ${allLocations.length} locations`}
        action={<LinkButton href="/admin/clients/new">Add client</LinkButton>}
      />
      <div className="p-8">
        {cs.length === 0 ? (
          <EmptyState
            title="No clients yet"
            body="Add a client and their locations to start scheduling shifts."
            action={<LinkButton href="/admin/clients/new">Add client</LinkButton>}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cs.map((c) => {
              const locs = allLocations.filter((l) => l.clientId === c.id);
              const shiftCount = allShifts.filter((s) => s.clientId === c.id).length;
              return (
                <Card
                  key={c.id}
                  title={c.name}
                  subtitle={<Meta items={[c.organisationType, `${locs.length} location${locs.length === 1 ? "" : "s"}`, `${shiftCount} shifts`]} />}
                  hover
                >
                  {locs.length === 0 ? (
                    <div className="text-sm" style={{ color: "var(--text-muted)" }}>No locations on file.</div>
                  ) : (
                    <ul className="space-y-3">
                      {locs.map((l) => (
                        <li
                          key={l.id}
                          className="flex items-start justify-between gap-4 pb-3 border-b last:border-0 last:pb-0"
                          style={{ borderColor: "var(--border-subtle)" }}
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{l.name}</div>
                            <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                              {l.addressLine1}, {l.city} <span className="h-num">{l.postcode}</span>
                            </div>
                          </div>
                          {l.contactName && (
                            <div className="text-xs text-right shrink-0" style={{ color: "var(--text-muted)" }}>
                              {l.contactName}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
