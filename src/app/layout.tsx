import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { TaskProvider } from "@/lib/store";
import { isClerkConfigured } from "@/lib/clerk-config";
import { AnonymousUserBridge, ClerkUserBridge } from "@/lib/user-bridge";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TaskFlow - Get things done",
  description: "A modern task management app",
};

// The layout blocks on `connection()` below, so under Cache Components it must
// opt out of static-shell validation — otherwise the build fails with
// "encountered uncached or runtime data during prerendering" for routes such as
// /_not-found. This does NOT force prerendering; `connection()` does that.
export const instant = false;

// With placeholder/absent Clerk keys the app falls back to running without auth;
// once real keys are set and the container rebuilt, Clerk takes over.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The Clerk provider decision depends on the runtime env (CLERK_SECRET_KEY),
  // which is not available at build time. Awaiting connection() forces
  // per-request rendering so the decision is made with the runtime env;
  // otherwise Next.js prerenders the layout at build time and bakes the
  // anonymous bridge into every page (no Clerk JS, no user).
  await connection();

  const clerkConfigured = isClerkConfigured();
  const providers = clerkConfigured ? (
    <ClerkProvider>
      <ClerkUserBridge>
        <TaskProvider>{children}</TaskProvider>
      </ClerkUserBridge>
    </ClerkProvider>
  ) : (
    <AnonymousUserBridge>
      <TaskProvider>{children}</TaskProvider>
    </AnonymousUserBridge>
  );
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#f6f7fb]">
        {providers}
      </body>
    </html>
  );
}
