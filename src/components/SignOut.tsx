"use client";
import { useClerk } from "@clerk/nextjs";

export function SignOutButton({ className = "h-btn h-btn-ghost h-btn-sm", label = "↗" }: { className?: string; label?: string }) {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      title="Sign out"
      className={className}
      onClick={() => signOut({ redirectUrl: "/login" })}
    >
      {label}
    </button>
  );
}
