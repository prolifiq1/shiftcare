import { db } from "@/lib/db";
import { clients, locations, shifts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, audit } from "@/lib/auth";
import { PageHeader, Card, Button, Field, Select, Textarea } from "@/lib/ui";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";

async function createShift(formData: FormData) {
  "use server";
  const user = await requireAdmin();
  const date = String(formData.get("date"));
  const startTime = String(formData.get("startTime"));
  const endTime = String(formData.get("endTime"));
  const locationId = String(formData.get("locationId"));
  const loc = (await db.select().from(locations).where(eq(locations.id, locationId)).get());
  if (!loc) redirect("/admin/shifts/new?error=1");

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  let endDate = date;
  let overnight = false;
  if (mins <= 0) {
    overnight = true; mins += 24 * 60;
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    endDate = d.toISOString().slice(0, 10);
  }

  const id = randomUUID();
  (await db.insert(shifts).values({
    id, agencyId: user.agencyId, clientId: loc!.clientId, locationId,
    date, endDate, startTime, endTime, overnight,
    durationMinutes: mins,
    shiftType: String(formData.get("shiftType")),
    workerType: String(formData.get("workerType")),
    workersRequired: Number(formData.get("workersRequired") || 1),
    workersFilled: 0, status: "PUBLISHED",
    assignmentMode: String(formData.get("assignmentMode")),
    payRate: Number(formData.get("payRate") || 0),
    chargeRate: Number(formData.get("chargeRate") || 0),
    requiredTraining: "[]",
    notes: String(formData.get("notes") || "") || null,
    publishedAt: new Date(), createdBy: user.id,
  }).run());
  await audit(user.id, user.agencyId, "shift.create", { type: "shift", id });
  redirect(`/admin/shifts/${id}`);
}

export default async function NewShift() {
  const user = await requireAdmin();
  const locs = (await db.select({ l: locations, c: clients })
    .from(locations).leftJoin(clients, eq(clients.id, locations.clientId))
    .where(eq(locations.agencyId, user.agencyId)).all());

  return (
    <>
      <PageHeader breadcrumb={<><a className="h-link" href="/admin/shifts">Shifts</a> / New</>} title="New shift" subtitle="Create a one-off shift and publish it to the marketplace." />
      <div className="p-8 max-w-3xl">
        <Card>
          <form action={createShift} className="space-y-5">
            <Select label="Client / location" name="locationId" required>
              {locs.map(({ l, c }) => <option key={l.id} value={l.id}>{c?.name} — {l.name}</option>)}
            </Select>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Date" type="date" name="date" required />
              <Field label="Start time" type="time" name="startTime" required />
              <Field label="End time" type="time" name="endTime" required />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Shift type" name="shiftType" defaultValue="LATE">
                <option>EARLY</option><option>LATE</option><option>LONG_DAY</option>
                <option>SLEEP_IN</option><option>WAKING_NIGHT</option><option>TWILIGHT</option><option>CUSTOM</option>
              </Select>
              <Select label="Worker type" name="workerType" defaultValue="SUPPORT_WORKER">
                <option>SUPPORT_WORKER</option><option>SENIOR_SUPPORT_WORKER</option>
                <option>TEAM_LEAD</option><option>HCA</option><option>RN</option><option>PA</option>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Workers required" type="number" name="workersRequired" defaultValue={1} min={1} />
              <Field label="Pay rate (£/hr)" type="number" step="0.01" name="payRate" defaultValue={13.2} />
              <Field label="Charge rate (£/hr)" type="number" step="0.01" name="chargeRate" defaultValue={22} />
            </div>
            <Select label="Assignment mode" name="assignmentMode" defaultValue="OPEN_MARKET">
              <option value="OPEN_MARKET">Open market — first eligible worker wins</option>
              <option value="APPROVAL_REQUIRED">Approval required — coordinator approves</option>
              <option value="INVITE_ONLY">Invite only</option>
              <option value="AUTO_ASSIGN">Auto-assign (top match)</option>
            </Select>
            <Textarea label="Notes (internal)" name="notes" rows={3} />
            <div className="flex gap-2">
              <Button type="submit">Create & publish</Button>
              <a href="/admin/shifts" className="h-btn h-btn-ghost">Cancel</a>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
