import { db } from "@/lib/db";
import { clients, locations } from "@/lib/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { PageHeader, Card, Button, Field, Select } from "@/lib/ui";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";

async function createClient(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/admin/clients/new?error=name");
  const organisationType = String(formData.get("organisationType") || "SUPPORTED_LIVING");

  const clientId = randomUUID();
  db.insert(clients)
    .values({ id: clientId, agencyId: user.agencyId, name, organisationType, active: true })
    .run();

  const locName = String(formData.get("locName") || "").trim();
  if (locName) {
    db.insert(locations)
      .values({
        id: randomUUID(),
        agencyId: user.agencyId,
        clientId,
        name: locName,
        addressLine1: String(formData.get("addressLine1") || "") || null,
        city: String(formData.get("city") || "") || null,
        postcode: String(formData.get("postcode") || "") || null,
        contactName: String(formData.get("contactName") || "") || null,
        contactPhone: String(formData.get("contactPhone") || "") || null,
        active: true,
      })
      .run();
  }

  audit(user.id, user.agencyId, "client.create", { type: "client", id: clientId }, { name });
  redirect("/admin/clients");
}

export default async function NewClient({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;

  return (
    <>
      <PageHeader
        breadcrumb={<><a className="h-link" href="/admin/clients">Clients</a> / New</>}
        title="Add client"
        subtitle="Create a client and, optionally, their first location."
      />
      <div className="p-8 max-w-3xl">
        <Card>
          <form action={createClient} className="space-y-5">
            {sp.error === "name" && (
              <div className="h-error">Client name is required.</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Client name" name="name" required placeholder="e.g. NELC" />
              <Select label="Organisation type" name="organisationType" defaultValue="SUPPORTED_LIVING">
                <option value="SUPPORTED_LIVING">Supported living</option>
                <option value="RESIDENTIAL_CARE">Residential care</option>
                <option value="NURSING_HOME">Nursing home</option>
                <option value="DOMICILIARY">Domiciliary care</option>
                <option value="LOCAL_AUTHORITY">Local authority</option>
                <option value="NHS">NHS</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>

            <div className="pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="h-section-title mb-3">First location (optional)</div>
              <div className="space-y-4">
                <Field label="Location name" name="locName" placeholder="e.g. 495 Cromwell Road" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Address line 1" name="addressLine1" />
                  <Field label="City" name="city" defaultValue="Grimsby" />
                  <Field label="Postcode" name="postcode" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Contact name" name="contactName" />
                  <Field label="Contact phone" name="contactPhone" />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit">Create client</Button>
              <a href="/admin/clients" className="h-btn h-btn-ghost">Cancel</a>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
