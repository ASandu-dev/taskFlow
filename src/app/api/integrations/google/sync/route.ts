import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getOrCreateUserSettings } from "@/lib/user-settings";
import {
  fetchGoogleCalendarEvents,
  getGoogleOAuthConfig,
  getSyncWindow,
  mapGoogleEventToCalendarEvent,
  refreshGoogleAccessToken,
  GOOGLE_PROVIDER,
  type MappedCalendarEvent,
} from "@/lib/google-calendar";

const SYNC_ERROR_MESSAGE = "Google Calendar sync failed. Please try again shortly.";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limited = enforceRateLimit("google-sync", userId, req.headers, RATE_LIMITS.googleSync);
  if (limited) return limited;

  const origin = new URL(req.url).origin;
  const scope = { provider: GOOGLE_PROVIDER, userId } as const;
  try {
    const integration = await prisma.integration.findUnique({
      where: { provider_userId: scope },
    });
    if (!integration?.connected || !integration.accessToken) {
      return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 400 });
    }

    const config = getGoogleOAuthConfig(origin);
    if (!config.configured) {
      return NextResponse.json({ error: "Google Calendar credentials are not configured." }, { status: 400 });
    }

    let accessToken = integration.accessToken;
    const expiresSoon = integration.expiresAt
      ? integration.expiresAt.getTime() - Date.now() < 60_000
      : false;

    if (expiresSoon && integration.refreshToken) {
      const refreshed = await refreshGoogleAccessToken(config, integration.refreshToken);
      accessToken = refreshed.access_token;
      await prisma.integration.update({
        where: { provider_userId: scope },
        data: {
          accessToken: refreshed.access_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          tokenType: refreshed.token_type ?? integration.tokenType,
          scope: refreshed.scope ?? integration.scope,
        },
      });
    }

    const googleEvents = await fetchGoogleCalendarEvents(
      accessToken,
      integration.calendarId,
      getSyncWindow()
    );
    // Synced Google events are personal to this user (ownerId = userId) by
    // default. Opt-in family sharing (settings flag + at least one family)
    // promotes them to family-shared events on the user's first family.
    const mapped = googleEvents
      .map((event) => mapGoogleEventToCalendarEvent(event, userId))
      .filter((event): event is MappedCalendarEvent => event !== null);

    const settings = await getOrCreateUserSettings(userId);
    const familyId = settings.shareSyncedEventsWithFamily
      ? ((
          await prisma.familyGroupMember.findFirst({
            where: { userId },
            orderBy: { joinedAt: "asc" },
            select: { groupId: true },
          })
        )?.groupId ?? null)
      : null;

    // Never share by default: only override when sharing is enabled AND a family
    // actually exists; otherwise keep the personal work events from the mapper.
    const eventsToSync = familyId
      ? mapped.map((event) => ({
          ...event,
          visibility: "family" as const,
          familyGroupId: familyId,
        }))
      : mapped;

    const externalIds = mapped.map((event) => event.externalId);

    await prisma.$transaction([
      ...eventsToSync.map((event) =>
        prisma.calendarEvent.upsert({
          where: { externalId: event.externalId },
          update: {
            title: event.title,
            date: event.date,
            time: event.time,
            color: event.color,
            category: event.category,
            source: event.source,
            ownerId: event.ownerId,
            familyGroupId: event.familyGroupId,
            visibility: event.visibility,
          },
          create: event,
        })
      ),
      // Reconcile only this user's own synced events; never touch other users'.
      prisma.calendarEvent.deleteMany({
        where: {
          source: "google",
          ownerId: userId,
          ...(externalIds.length > 0 ? { externalId: { notIn: externalIds } } : {}),
        },
      }),
      prisma.integration.update({
        where: { provider_userId: scope },
        data: { lastSyncedAt: new Date(), lastSyncError: null },
      }),
    ]);

    return NextResponse.json({ imported: mapped.length, scanned: googleEvents.length });
  } catch (error) {
    // Do not echo raw provider/DB errors (or token material) to the client or
    // store them for display.
    console.error(
      "Syncing Google Calendar failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    await prisma.integration
      .update({ where: { provider_userId: scope }, data: { lastSyncError: SYNC_ERROR_MESSAGE } })
      .catch(() => undefined);
    return NextResponse.json({ error: SYNC_ERROR_MESSAGE }, { status: 502 });
  }
}
