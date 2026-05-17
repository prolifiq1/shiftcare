import { db } from "@/lib/db";
import { notifications } from "@/lib/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PageHeader, EmptyState, Card, Tabs } from "@/lib/ui";
import { redirect } from "next/navigation";
import Link from "next/link";

async function markAllRead() {
  "use server";
  const user = await requireSession();
  (await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))).run());
  redirect("/admin/notifications");
}

async function markRead(formData: FormData) {
  "use server";
  const user = await requireSession();
  const id = String(formData.get("id"));
  (await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id))).run());
  const href = String(formData.get("href") || "/admin/notifications");
  redirect(href);
}

export default async function AdminNotifications({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireSession();
  const sp = await searchParams;
  const tab = sp.tab || "unread";

  const all = (await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).all());
  const unread = all.filter((n) => !n.readAt);
  const rows = tab === "unread" ? unread : all;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={`${unread.length} unread`}
        action={
          unread.length > 0 ? (
            <form action={markAllRead}>
              <button className="h-btn h-btn-secondary h-btn-sm" type="submit">Mark all read</button>
            </form>
          ) : null
        }
      />
      <div className="px-8 pt-4">
        <Tabs
          current={tab}
          tabs={[
            { key: "unread", label: "Unread", href: "/admin/notifications?tab=unread", count: unread.length },
            { key: "all", label: "All", href: "/admin/notifications?tab=all", count: all.length },
          ]}
        />
      </div>
      <div className="p-8">
        {rows.length === 0 ? (
          <EmptyState title="You're all caught up" body="New activity will show up here." />
        ) : (
          <Card padded={false}>
            <ul>
              {rows.map((n) => (
                <li
                  key={n.id}
                  className="px-5 py-4 flex items-start gap-4 last:border-0"
                  style={{ borderBottom: "1px solid var(--border-subtle)", background: n.readAt ? "transparent" : "var(--brand-50)" }}
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
                    {n.body && <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{n.body}</div>}
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      {n.href && (
                        <form action={markRead} className="inline">
                          <input type="hidden" name="id" value={n.id} />
                          <input type="hidden" name="href" value={n.href} />
                          <button className="h-link" type="submit">Open →</button>
                        </form>
                      )}
                      {!n.readAt && !n.href && (
                        <form action={markRead} className="inline">
                          <input type="hidden" name="id" value={n.id} />
                          <button className="h-link" type="submit">Mark as read</button>
                        </form>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <div className="px-8 pb-8 text-xs" style={{ color: "var(--text-muted)" }}>
        <Link href="/admin" className="h-link">← Back to dashboard</Link>
      </div>
    </>
  );
}
