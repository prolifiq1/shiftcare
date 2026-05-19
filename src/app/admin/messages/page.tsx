import { db } from "@/lib/db";
import { messages, users } from "@/lib/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { requireAdmin, notify, audit } from "@/lib/auth";
import { PageHeader, Card, Button, Textarea, EmptyState, Avatar } from "@/lib/ui";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import Link from "next/link";

async function reply(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const workerId = String(formData.get("workerId"));
  const body = String(formData.get("body") || "").trim().slice(0, 4000);
  const target = await db.select().from(users).where(and(eq(users.id, workerId), eq(users.agencyId, admin.agencyId))).get();
  if (!target || !body) redirect(`/admin/messages?w=${workerId}`);
  await db.insert(messages).values({
    id: randomUUID(),
    agencyId: admin.agencyId,
    workerId,
    senderId: admin.id,
    senderRole: "ADMIN",
    body,
  }).run();
  await audit(admin.id, admin.agencyId, "message.send", { type: "thread", id: workerId });
  await notify(workerId, {
    type: "MESSAGE",
    title: "Message from the office",
    body: body.slice(0, 120),
    href: "/worker/messages",
  });
  redirect(`/admin/messages?w=${workerId}`);
}

export default async function AdminMessages({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  const all = await db
    .select({ m: messages, u: users })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.workerId))
    .where(eq(messages.agencyId, admin.agencyId))
    .orderBy(desc(messages.createdAt))
    .all();

  // Build thread summaries grouped by worker.
  const byWorker = new Map<string, { name: string; last: typeof all[number]["m"]; unread: number }>();
  for (const r of all) {
    const cur = byWorker.get(r.m.workerId);
    const unreadInc = r.m.senderRole === "WORKER" && !r.m.readAt ? 1 : 0;
    if (!cur) {
      byWorker.set(r.m.workerId, {
        name: r.u ? `${r.u.firstName} ${r.u.lastName}` : "Unknown worker",
        last: r.m,
        unread: unreadInc,
      });
    } else {
      cur.unread += unreadInc;
    }
  }
  const threads = Array.from(byWorker.entries());

  const activeId = sp.w;
  let activeThread: typeof all[number]["m"][] = [];
  let activeName = "";
  if (activeId) {
    await db.update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.workerId, activeId), eq(messages.senderRole, "WORKER"), isNull(messages.readAt)))
      .run();
    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.workerId, activeId), eq(messages.agencyId, admin.agencyId)))
      .orderBy(asc(messages.createdAt))
      .all();
    activeThread = rows;
    const wu = await db.select().from(users).where(eq(users.id, activeId)).get();
    activeName = wu ? `${wu.firstName} ${wu.lastName}` : "Worker";
  }

  return (
    <>
      <PageHeader title="Messages" subtitle={`${threads.length} conversation${threads.length === 1 ? "" : "s"}`} />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card title="Conversations" padded={false}>
            {threads.length === 0 ? (
              <div className="p-6"><EmptyState title="No conversations" body="Worker messages appear here." /></div>
            ) : (
              <ul>
                {threads.map(([wid, t]) => (
                  <li key={wid} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Link
                      href={`/admin/messages?w=${wid}`}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ background: wid === activeId ? "var(--base-02)" : "transparent" }}
                    >
                      <Avatar name={t.name} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{t.last.body}</div>
                      </div>
                      {t.unread > 0 && <span className="h-pill h-pill-brand">{t.unread}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          {!activeId ? (
            <Card><EmptyState title="Select a conversation" body="Choose a worker on the left to view and reply." /></Card>
          ) : (
            <Card title={activeName} padded={false}>
              <div className="p-5 space-y-3" style={{ maxHeight: 460, overflowY: "auto" }}>
                {activeThread.length === 0 ? (
                  <EmptyState title="No messages yet" body="Start the conversation below." />
                ) : (
                  activeThread.map((m) => {
                    const mine = m.senderRole === "ADMIN";
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
                          <div className="text-[10px] mt-1 h-num" style={{ color: mine ? "rgba(255,255,255,.7)" : "var(--text-muted)" }}>
                            {mine ? "Office" : activeName} · {m.createdAt?.toISOString().slice(0, 16).replace("T", " ")}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form action={reply} className="p-4 border-t flex gap-2 items-end" style={{ borderColor: "var(--border-subtle)" }}>
                <input type="hidden" name="workerId" value={activeId} />
                <div className="flex-1">
                  <Textarea name="body" rows={2} placeholder="Write a reply…" required />
                </div>
                <Button type="submit">Send</Button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
