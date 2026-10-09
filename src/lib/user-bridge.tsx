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
}

interface UserSourceValue {
  user: UserSourceUser | null;
  clerkEnabled: boolean;
}

const UserSourceContext = createContext<UserSourceValue>({ user: null, clerkEnabled: false });

/** Read the signed-in user without caring whether Clerk is actually configured. */
export function useUserSource(): UserSourceValue {
  return useContext(UserSourceContext);
}

/** Rendered inside <ClerkProvider> when real keys are configured. */
export function ClerkUserBridge({ children }: { children: ReactNode }) {
  const clerkUser = useUser();
  return (
    <UserSourceContext.Provider value={{ user: clerkUser.user ?? null, clerkEnabled: true }}>
      {children}
    </UserSourceContext.Provider>
  );
}

/** Rendered when no Clerk keys are configured — the app runs without auth. */
export function AnonymousUserBridge({ children }: { children: ReactNode }) {
  return <UserSourceContext.Provider value={{ user: null, clerkEnabled: false }}>{children}</UserSourceContext.Provider>;
}