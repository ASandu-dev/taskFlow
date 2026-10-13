import type { InvitationStatus } from "@/types";

/** Default lifetime of a freshly issued invitation. */
export const DEFAULT_INVITATION_EXPIRY_DAYS = 7;
/** Upper bound a caller may request for `expiresInDays`. */
export const MAX_INVITATION_EXPIRY_DAYS = 30;

export interface InvitationLifecycle {
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date;
}

/**
 * Derives the single lifecycle state shown to the UI. Precedence matters: a
 * redeemed invitation is `accepted` even if it was later revoked, a revoked one
 * is `revoked` even once its expiry passes, and only never-used, never-revoked,
 * past-expiry rows are `expired`.
 */
export function deriveInvitationStatus(
  invitation: InvitationLifecycle,
  now: number = Date.now()
): InvitationStatus {
  if (invitation.usedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (invitation.expiresAt.getTime() <= now) return "expired";
  return "pending";
}

/** Returns an expiry timestamp `days` from now. */
export function invitationExpiryFromDays(days: number, now: number = Date.now()): Date {
  return new Date(now + days * 24 * 60 * 60 * 1000);
}
