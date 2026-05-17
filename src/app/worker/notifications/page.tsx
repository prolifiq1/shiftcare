import { db } from "@/lib/db";
import { notifications } from "@/lib/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireWorker, requireSession } from "@/lib/auth";
import { EmptyState, PageHeader, Card } from "@/lib/ui";
import { redirect } from "next/navigation";

async function markAllRead() {
  "use server";
  const user = await requireSession();
  db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .run();
  redirect("/worker/notifications");
}

async function open(formData: FormData) {
  "use server";
  const user = await requireSession();
  const id = String(formData.get("id"));
  db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .run();
  const href = String(formData.get("href") || "/worker/notifications");
  redirect(href);
}

export default async function WorkerInbox() {
  const user = await requireWorker();
  const rows = db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .all();
  const unread = rows.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={`${unread} unread`}
        action={
          unread > 0 ? (
            <form action={markAllRead}>
              <button className="h-btn h-btn-secondary h-btn-sm" type="submit">
                Mark all read
              </button>
            </form>
          ) : null
        }
      />
      <div className="p-8">
        {rows.length === 0 ? (
          <EmptyState
            title="No notifications yet"
            body="We’ll let you know about confirmations, cancellations, and timesheet updates."
          />
        ) : (
          <Card padded={false}>
            <ul>
              {rows.map((n) => (
                <li
                  key={n.id}
                  className="px-5 py-4 flex items-start gap-4 last:border-0"
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    background: n.readAt ? "transparent" : "var(--brand-50)",
                  }}
                >
                  <div
                    className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                    style={{ background: n.readAt ? "var(--border-strong)" : "var(--brand-500)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="font-medium text-sm">{n.title}</div>
                      <div className="text-xs h-num shrink-0" style={{ color: "var(--text-muted)" }}>
                        {n.createdAt?.toISOString().slice(0, 16).replace("T", " ")}
                      </div>
                    </div>
                    {n.body && (
                      <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                        {n.body}
                      </div>
                    )}
                    {n.href && (
                      <form action={open} className="mt-2">
                        <input type="hidden" name="id" value={n.id} />
                        <input type="hidden" name="href" value={n.href} />
                        <button className="h-link text-xs" type="submit">
                          Open →
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
