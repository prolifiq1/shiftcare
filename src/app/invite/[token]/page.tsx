import Link from "next/link";
import { findInvite } from "@/lib/auth";
import { Banner } from "@/lib/ui";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inv = await findInvite(token);
  const invalid = !inv || inv.acceptedAt || inv.expiresAt.getTime() < Date.now();

  return (
    <div className="h-auth-shell">
      <div className="flex items-center justify-center p-8">
        <div className="h-auth-card">
          <div className="mb-6 flex items-center gap-2">
            <div className="h-8 w-8 rounded-md" style={{ background: "var(--brand-500)" }} />
            <div className="font-semibold text-lg">ShiftCare</div>
          </div>
          <h1 className="text-xl font-semibold mb-1">Accept your invitation</h1>
          {invalid ? (
            <Banner tone="danger" title="Invalid or expired invite">
              Please ask your admin to send a new one.
            </Banner>
          ) : (
            <>
              <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
                You’ve been invited as <b>{inv!.role.replace(/_/g, " ")}</b>.
              </p>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                Create your account using <b>{inv!.email}</b> — your access is
                linked to that email automatically on first sign-in.
              </p>
              <Link
                href="/sign-up"
                className="h-btn h-btn-primary h-btn-block h-btn-lg"
              >
                Create account
              </Link>
              <div className="text-xs mt-4 text-center" style={{ color: "var(--text-muted)" }}>
                Already have an account?{" "}
                <Link href="/login" className="h-link">Sign in</Link>
              </div>
            </>
          )}
        </div>
      </div>
      <aside className="h-auth-aside" />
    </div>
  );
}
