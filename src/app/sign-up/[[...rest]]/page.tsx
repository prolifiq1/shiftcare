import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="h-auth-shell">
      <div className="h-auth-card" style={{ display: "flex", justifyContent: "center" }}>
        <SignUp signInUrl="/login" fallbackRedirectUrl="/post-login" />
      </div>
    </div>
  );
}
