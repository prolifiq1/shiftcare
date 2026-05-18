import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOut";

export default async function PostLogin() {
  const s = await getSession();
  if (s) {
    if (s.role === "SUPER_ADMIN") redirect("/platform");
    if (s.role === "WORKER") redirect("/worker");
    redirect("/admin");
  }
  // Authenticated with Clerk but not linked to any agency/role yet.
  return (
    <div className="h-auth-shell">
      <div className="h-auth-card" style={{ textAlign: "center", maxWidth: 420 }}>
        <h1 className="text-xl font-semibold tracking-tight">Account not linked yet</h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          Your sign-in worked, but this email isn’t connected to an agency
          workspace. Ask your agency admin to send you an invite, then sign in
          again with the same email.
        </p>
        <div className="mt-5">
          <SignOutButton className="h-btn h-btn-secondary" label="Sign out" />
        </div>
      </div>
    </div>
  );
}
