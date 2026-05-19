import { db } from "@/lib/db";
import { messages, users } from "@/lib/schema";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { requireWorker, notify, audit } from "@/lib/auth";
import { PageHeader, Card, Button, Textarea, EmptyState } from "@/lib/ui";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";

async function send(formData: FormData) {
  "use server";
  const user = await requireWorker();
  const body = String(formData.get("body") || "").trim().slice(0, 4000);
  if (!body) redirect("/worker/messages");
  await db.insert(messages).values({
    id: randomUUID(),
    agencyId: user.agencyId,
    workerId: user.id,
    senderId: user.id,
    senderRole: "WORKER",
    body,
  }).run();
  await audit(user.id, user.agencyId, "message.send", { type: "thread", id: user.id });
  const admins = (await db.select().from(users).where(eq(users.agencyId, user.agencyId)).all())
    .filter((u) => ["AGENCY_ADMIN", "COORDINATOR", "COMPLIANCE"].includes(u.role));
  for (const a of admins) {
    await notify(a.id, {
      type: "MESSAGE",
      title: `Message from ${user.firstName} ${user.lastName}`,
      body: body.slice(0, 120),
      href: `/admin/messages?w=${user.id}`,
    });
  }
  redirect("/worker/messages");
}

export default async function WorkerMessages() {
  const user = await requireWorker();

  // Mark office → worker messages as read.
  await db.update(messages)
    .set({ readAt: new Date() })
    .where(and(eq(messages.workerId, user.id), eq(messages.senderRole, "ADMIN"), isNull(messages.readAt)))
    .run();

  const thread = await db
    .select()
    .from(messages)
    .where(eq(messages.workerId, user.id))
    .orderBy(asc(messages.createdAt))
    .all();

  return (
    <>
      <PageHeader title="Messages" subtitle="Chat with the agency office." />
      <div className="p-8 max-w-3xl space-y-4">
        <Card padded={false}>
          <div className="p-5 space-y-3" style={{ maxHeight: 460, overflowY: "auto" }}>
            {thread.length === 0 ? (
              <EmptyState title="No messages yet" body="Send the office a message below — they’ll reply here." />
            ) : (
              thread.map((m) => {
                const mine = m.senderRole === "WORKER";
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[75%] rounded-lg px-3.5 py-2.5 text-sm"
                      style={{
                        background: mine ? "var(--brand-500)" : "var(--base-02)",
                        color: mine ? "#fff" : "var(--text-primary)",
                        border: mine ? "none" : "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                      <div
                        className="text-[10px] mt-1 h-num"
                        style={{ color: mine ? "rgba(255,255,255,.7)" : "var(--text-muted)" }}
                      >
                        {mine ? "You" : "Office"} · {m.createdAt?.toISOString().slice(0, 16).replace("T", " ")}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <form action={send} className="p-4 border-t flex gap-2 items-end" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex-1">
              <Textarea name="body" rows={2} placeholder="Write a message…" required />
            </div>
            <Button type="submit">Send</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
