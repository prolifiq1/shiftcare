import Link from "next/link";
import { requireAdmin, stopImpersonation } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifications, agencies } from "@/lib/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { Avatar } from "@/lib/ui";
import { SignOutButton } from "@/components/SignOut";

async function stopImpersonationAction() {
  "use server";
  await stopImpersonation();
}

const NAV: { href: string; label: string; icon: string; group?: string }[] = [
  { href: "/admin", label: "Dashboard", icon: "▦", group: "OVERVIEW" },
  { href: "/admin/shifts", label: "Shifts", icon: "▤", group: "OPERATIONS" },
  { href: "/admin/import", label: "Import", icon: "⇲", group: "OPERATIONS" },
  { href: "/admin/bookings", label: "Bookings", icon: "✓", group: "OPERATIONS" },
  { href: "/admin/timesheets", label: "Timesheets", icon: "⏱", group: "OPERATIONS" },
  { href: "/admin/workers", label: "Workers", icon: "◔", group: "PEOPLE" },
  { href: "/admin/documents", label: "Documents", icon: "▢", group: "PEOPLE" },
  { href: "/admin/messages", label: "Messages", icon: "✉", group: "PEOPLE" },
  { href: "/admin/clients", label: "Clients", icon: "◈", group: "PEOPLE" },
  { href: "/admin/team", label: "Team", icon: "◉", group: "PEOPLE" },
  { href: "/admin/notifications", label: "Notifications", icon: "◎", group: "SYSTEM" },
  { href: "/admin/activity", label: "Activity log", icon: "◐", group: "SYSTEM" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const agency = (await db.select().from(agencies).where(eq(agencies.id, user.agencyId)).get());
  const unread = (await db.select().from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt)).limit(5).all());

  const groups = Array.from(new Set(NAV.map(n => n.group!)));
  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-page)" }}>
      <aside className="w-64 flex flex-col border-r sticky top-0 h-screen"
        style={{ background: "var(--bg-canvas)", borderColor: "var(--border-subtle)" }}>
        <div className="px-5 py-5 flex items-center gap-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="h-8 w-8 rounded-md" style={{ background: "var(--brand-500)" }} />
          <div>
            <div className="font-semibold tracking-tight">ShiftCare</div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{agency?.name || "Workspace"}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-auto px-3 py-4 space-y-5">
          {groups.map(g => (
            <div key={g}>
              <div className="h-section-title px-2">{g}</div>
              <div className="space-y-0.5">
                {NAV.filter(n => n.group === g).map(n => (
                  <Link key={n.href} href={n.href} className="h-nav-item">
                    <span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>{n.icon}</span>
                    <span>{n.label}</span>
                    {n.href === "/admin/notifications" && unread.length > 0 && (
                      <span className="ml-auto h-pill h-pill-brand">{unread.length}</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t flex items-center gap-3" style={{ borderColor: "var(--border-subtle)" }}>
          <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarDocId ? `/api/documents/${user.avatarDocId}` : null} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{user.firstName} {user.lastName}</div>
            <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{user.role.replace(/_/g, " ")}</div>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        {user.impersonatorId && (
          <div
            className="flex items-center justify-between px-8 py-2.5 text-sm"
            style={{ background: "var(--status-warn-bg)", color: "var(--status-warn-fg)", borderBottom: "1px solid var(--status-warn-border)" }}
          >
            <span>
              Viewing <strong>{agency?.name}</strong> as an impersonated admin (super-admin session).
            </span>
            <form action={stopImpersonationAction}>
              <button className="h-btn h-btn-secondary h-btn-sm" type="submit">Stop impersonating</button>
            </form>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
