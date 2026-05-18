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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider signInUrl="/login" signUpUrl="/sign-up">
      <html lang="en" className={`${inter.variable} ${mono.variable}`}>
        <body style={{ background: "var(--bg-page)" }}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
