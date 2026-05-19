import Link from "next/link";
import { requireSuperAdmin, logout } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Avatar } from "@/lib/ui";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

const NAV = [
  { href: "/platform", label: "Agencies", icon: "▦" },
  { href: "/platform/activity", label: "Global activity", icon: "◐" },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-page)" }}>
      <aside
        className="w-64 flex flex-col border-r sticky top-0 h-screen"
        style={{ background: "var(--bg-canvas)", borderColor: "var(--border-subtle)" }}
      >
        <div className="px-5 py-5 flex items-center gap-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="h-8 w-8 rounded-md" style={{ background: "var(--text-primary)" }} />
          <div>
            <div className="font-semibold tracking-tight">ShiftCare</div>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Platform console
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-auto px-3 py-4 space-y-0.5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="h-nav-item">
              <span className="w-4 text-center" style={{ color: "var(--text-muted)" }}>{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
        <form
          action={logoutAction}
          className="p-3 border-t flex items-center gap-3"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarDocId ? `/api/documents/${user.avatarDocId}` : null} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user.firstName} {user.lastName}</div>
            <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>Super admin</div>
          </div>
          <button className="h-btn h-btn-ghost h-btn-sm" title="Sign out">↗</button>
        </form>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
