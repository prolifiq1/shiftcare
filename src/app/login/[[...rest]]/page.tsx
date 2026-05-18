import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="h-auth-shell">
      <div className="h-auth-card" style={{ display: "flex", justifyContent: "center" }}>
        <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/post-login" />
      </div>
    </div>
  );
}
