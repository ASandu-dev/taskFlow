import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchGoogleCalendarEvents,
  getGoogleOAuthConfig,
  getSyncWindow,
  mapGoogleEventToCalendarEvent,
  refreshGoogleAccessToken,
  GOOGLE_PROVIDER,
  type MappedCalendarEvent,
} from "@/lib/google-calendar";

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  try {
    const integration = await prisma.integration.findUnique({ where: { provider: GOOGLE_PROVIDER } });
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
        where: { provider: GOOGLE_PROVIDER },
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
    const mapped = googleEvents
      .map(mapGoogleEventToCalendarEvent)
      .filter((event): event is MappedCalendarEvent => event !== null);
    const externalIds = mapped.map((event) => event.externalId);

    await prisma.$transaction([
      ...mapped.map((event) =>
        prisma.calendarEvent.upsert({
          where: { externalId: event.externalId },
          update: {
            title: event.title,
            date: event.date,
            time: event.time,
            color: event.color,
            category: event.category,
            source: event.source,
          },
          create: event,
        })
      ),
      prisma.calendarEvent.deleteMany({
        where: {
          source: "google",
          ...(externalIds.length > 0 ? { externalId: { notIn: externalIds } } : {}),
        },
      }),
      prisma.integration.update({
        where: { provider: GOOGLE_PROVIDER },
        data: { lastSyncedAt: new Date(), lastSyncError: null },
      }),
    ]);

    return NextResponse.json({ imported: mapped.length, scanned: googleEvents.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar sync failed.";
    console.error("Syncing Google Calendar failed", error);
    await prisma.integration
      .update({ where: { provider: GOOGLE_PROVIDER }, data: { lastSyncError: message } })
      .catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
