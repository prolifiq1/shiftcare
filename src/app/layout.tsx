import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans-loaded", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-loaded", display: "swap" });

export const metadata: Metadata = {
  title: "ShiftCare — Care & support workforce operations",
  description: "Premium UK-first care/support shift booking platform.",
};

const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to ShiftCare",
      subtitle: "Welcome back — sign in to continue.",
    },
  },
  signUp: {
    start: {
      title: "Create your ShiftCare account",
      subtitle: "Use the email your agency invited.",
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider signInUrl="/login" signUpUrl="/sign-up" localization={clerkLocalization}>
      <html lang="en" className={`${inter.variable} ${mono.variable}`}>
        <body style={{ background: "var(--bg-page)" }}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
