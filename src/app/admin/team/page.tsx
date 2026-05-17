import { db } from "@/lib/db";
import { users, invites } from "@/lib/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireAdmin, createInvite } from "@/lib/auth";
import { PageHeader, Card, DataTable, EmptyState, Avatar, Field, Select, Button, Banner, Chip } from "@/lib/ui";
import { redirect } from "next/navigation";

async function inviteAction(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "AGENCY_COORDINATOR");
  const firstName = String(formData.get("firstName") || "") || undefined;
  const lastName = String(formData.get("lastName") || "") || undefined;
  if (!email) redirect("/admin/team?error=email");
  const { token } = createInvite({
    agencyId: user.agencyId,
    email,
    role: role as any,
    firstName,
    lastName,
    invitedBy: user.id,
  });
  redirect(`/admin/team?invited=${encodeURIComponent(email)}&token=${token}`);
}

async function revokeInvite(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id"));
  db.delete(invites).where(eq(invites.id, id)).run();
  redirect("/admin/team");
}

const ROLE_LABEL: Record<string, string> = {
  AGENCY_OWNER: "Owner",
  AGENCY_ADMIN: "Admin",
  AGENCY_COORDINATOR: "Coordinator",
  AGENCY_FINANCE: "Finance",
  WORKER: "Worker",
};

export default async function Team({ searchParams }: { searchParams: Promise<{ invited?: string; token?: string; error?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const team = db
    .select()
    .from(users)
    .where(and(eq(users.agencyId, user.agencyId)))
    .all()
    .filter((u) => u.role !== "WORKER");
  const pending = db
    .select()
    .from(invites)
    .where(and(eq(invites.agencyId, user.agencyId), isNull(invites.acceptedAt)))
    .orderBy(desc(invites.createdAt))
    .all()
    .filter((i) => i.expiresAt.getTime() > Date.now());

  const inviteUrl = sp.token ? `${process.env.APP_URL || ""}/invite/${sp.token}` : null;

  return (
    <>
      <PageHeader title="Team" subtitle={`${team.length} members · ${pending.length} pending`} />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {sp.invited && (
            <Banner tone="ok" title={`Invite created for ${sp.invited}`}>
              {inviteUrl ? (
                <>
                  Share this link (dev mode):{" "}
                  <a className="h-link break-all" href={`/invite/${sp.token}`}>{`/invite/${sp.token}`}</a>
                </>
              ) : (
                "We’ll email them shortly."
              )}
            </Banner>
          )}
          {sp.error && <Banner tone="danger" title="Couldn’t send invite">Email is required.</Banner>}

          <Card title="Active members" padded={false}>
            {team.length === 0 ? (
              <div className="p-8"><EmptyState title="No team members" body="Invite a teammate to get started." /></div>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>MFA</th>
                    <th>Last login</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={`${u.firstName} ${u.lastName}`} />
                          <div className="font-medium">{u.firstName} {u.lastName}</div>
                        </div>
                      </td>
                      <td className="text-sm" style={{ color: "var(--text-secondary)" }}>{u.email}</td>
                      <td><Chip>{ROLE_LABEL[u.role] || u.role}</Chip></td>
                      <td>
                        <span
                          className="text-xs font-medium"
                          style={{ color: u.mfaEnabled ? "var(--status-ok-fg)" : "var(--text-muted)" }}
                        >
                          {u.mfaEnabled ? "Enabled" : "Off"}
                        </span>
                      </td>
                      <td className="text-xs h-num" style={{ color: "var(--text-muted)" }}>
                        {u.lastLoginAt?.toISOString().slice(0, 10) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>

          {pending.length > 0 && (
            <Card title="Pending invites" padded={false}>
              <DataTable>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Expires</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((i) => (
                    <tr key={i.id}>
                      <td className="text-sm">{i.email}</td>
                      <td><Chip>{ROLE_LABEL[i.role] || i.role}</Chip></td>
                      <td className="text-xs h-num" style={{ color: "var(--text-muted)" }}>
                        {i.expiresAt.toISOString().slice(0, 10)}
                      </td>
                      <td className="text-right">
                        <form action={revokeInvite}>
                          <input type="hidden" name="id" value={i.id} />
                          <button className="h-link text-xs" type="submit" style={{ color: "var(--status-danger-fg)" }}>
                            Revoke
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Card>
          )}
        </div>

        <div>
          <Card title="Invite a teammate" subtitle="They’ll receive a 7-day link to set up their account.">
            <form action={inviteAction} className="space-y-3">
              <Field label="Email" type="email" name="email" required placeholder="name@agency.co.uk" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="First name" name="firstName" />
                <Field label="Last name" name="lastName" />
              </div>
              <Select label="Role" name="role" defaultValue="AGENCY_COORDINATOR">
                <option value="AGENCY_OWNER">Owner</option>
                <option value="AGENCY_ADMIN">Admin</option>
                <option value="AGENCY_COORDINATOR">Coordinator</option>
                <option value="AGENCY_FINANCE">Finance</option>
                <option value="WORKER">Worker</option>
              </Select>
              <Button type="submit" block>Send invite</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
