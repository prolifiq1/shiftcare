import Link from "next/link";
import { requireWorker } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifications, agencies } from "@/lib/schema";
import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { Avatar } from "@/lib/ui";
import { SignOutButton } from "@/components/SignOut";

const NAV: { href: string; label: string; icon: string; group: string }[] = [
  { href: "/worker", label: "Available shifts", icon: "▤", group: "WORK" },
  { href: "/worker/schedule", label: "My schedule", icon: "⌘", group: "WORK" },
  { href: "/worker/notifications", label: "Inbox", icon: "◎", group: "WORK" },
  { href: "/worker/profile", label: "Profile & docs", icon: "◉", group: "ACCOUNT" },
];

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireWorker();
  const agency = (await db.select().from(agencies).where(eq(agencies.id, user.agencyId)).get());
  const unread =
    (await db
      .select({ c: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
      .get())?.c ?? 0;

  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-page)" }}>
      <aside
        className="hidden md:flex w-64 flex-col border-r sticky top-0 h-screen"
        style={{ background: "var(--bg-canvas)", borderColor: "var(--border-subtle)" }}
      >
        <div className="px-5 py-5 flex items-center gap-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="h-8 w-8 rounded-md" style={{ background: "var(--brand-500)" }} />
          <div>
            <div className="font-semibold tracking-tight">ShiftCare</div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {agency?.name || "Worker portal"}
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-auto px-3 py-4 space-y-5">
          {groups.map((g) => (
            <div key={g}>
              <div className="h-section-title px-2">{g}</div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === g).map((n) => (
                  <Link key={n.href} href={n.href} className="h-nav-item">
                    <span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>{n.icon}</span>
                    <span>{n.label}</span>
                    {n.href === "/worker/notifications" && unread > 0 && (
                      <span className="ml-auto h-pill h-pill-brand">{unread}</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div
          className="p-3 border-t flex items-center gap-3"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <Avatar name={`${user.firstName} ${user.lastName}`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {user.firstName} {user.lastName}
            </div>
            <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
              Support worker
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header
          className="md:hidden flex items-center justify-between px-4 py-3 sticky top-0 z-10"
          style={{ background: "var(--bg-canvas)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md" style={{ background: "var(--brand-500)" }} />
            <div className="font-semibold tracking-tight text-sm">ShiftCare</div>
          </div>
          <SignOutButton className="h-link text-xs" label="Sign out" />
        </header>

        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <div className="max-w-5xl mx-auto w-full">{children}</div>
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-20"
          style={{ background: "var(--bg-canvas)", borderTop: "1px solid var(--border-subtle)" }}
        >
          <div className="grid grid-cols-4 text-xs">
            <NavTab href="/worker" label="Shifts" />
            <NavTab href="/worker/schedule" label="Schedule" />
            <NavTab href="/worker/notifications" label="Inbox" badge={unread} />
            <NavTab href="/worker/profile" label="Profile" />
          </div>
        </nav>
      </div>
    </div>
  );
}

function NavTab({ href, label, badge }: { href: string; label: string; badge?: number }) {
  return (
    <Link
      href={href}
      className="py-3 text-center font-medium transition-colors relative"
      style={{ color: "var(--text-secondary)" }}
    >
      <span className="inline-flex items-center gap-1.5">
        {label}
        {badge && badge > 0 ? (
          <span
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold h-num"
            style={{ background: "var(--brand-500)", color: "#fff" }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
