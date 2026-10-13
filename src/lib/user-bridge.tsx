"use client";

import { createContext, useContext, ReactNode } from "react";
import { useUser } from "@clerk/nextjs";

/**
 * The subset of Clerk's UserResource that the app reads. Kept minimal so the
 * anonymous fallback (no Clerk keys configured) can satisfy the same shape.
 */
export interface UserSourceUser {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  imageUrl: string;
  primaryEmailAddress: { emailAddress: string } | null;
  emailAddresses: Array<{ emailAddress: string }>;
  /** Clerk publicMetadata (e.g. the preset avatar id). */
  publicMetadata?: Record<string, unknown>;
  /**
   * Refetches the Clerk user so reactive consumers (the store's `user` memo)
   * pick up metadata changes without a full page reload. The underlying
   * Clerk UserResource exposes this at runtime; the subset type mirrors it.
   */
  reload?: () => Promise<unknown>;
}

interface UserSourceValue {
  user: UserSourceUser | null;
  clerkEnabled: boolean;
  isLoaded: boolean;
}

const UserSourceContext = createContext<UserSourceValue>({ user: null, clerkEnabled: false, isLoaded: true });

/** Read the signed-in user without caring whether Clerk is actually configured. */
export function useUserSource(): UserSourceValue {
  return useContext(UserSourceContext);
}

/** Rendered inside <ClerkProvider> when real keys are configured. */
export function ClerkUserBridge({ children }: { children: ReactNode }) {
  const clerkUser = useUser();
  return (
    <UserSourceContext.Provider value={{ user: clerkUser.user ?? null, clerkEnabled: true, isLoaded: clerkUser.isLoaded }}>
      {children}
    </UserSourceContext.Provider>
  );
}

/** Rendered when no Clerk keys are configured — the app runs without auth. */
export function AnonymousUserBridge({ children }: { children: ReactNode }) {
  return <UserSourceContext.Provider value={{ user: null, clerkEnabled: false, isLoaded: true }}>{children}</UserSourceContext.Provider>;
}