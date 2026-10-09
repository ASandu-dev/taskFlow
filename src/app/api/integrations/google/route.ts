import { connection, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";
import { getAppOrigin, getGoogleOAuthConfig, GOOGLE_PROVIDER } from "@/lib/google-calendar";
import type { IntegrationStatus } from "@/types";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const config = getGoogleOAuthConfig(getAppOrigin(new URL(req.url)));
    const integration = await prisma.integration.findUnique({ where: { provider: GOOGLE_PROVIDER } });

    const status: IntegrationStatus = {
      provider: GOOGLE_PROVIDER,
      configured: config.configured,
      connected: Boolean(integration?.connected && integration.accessToken),
      accountEmail: integration?.accountEmail ?? null,
      calendarId: integration?.calendarId ?? "primary",
      lastSyncedAt: integration?.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: integration?.lastSyncError ?? null,
    };

    return NextResponse.json(status);
  } catch (error) {
    return apiError(error, "Loading Google Calendar integration", "Unable to load the integration status.");
  }
}

export async function DELETE() {
  try {
    await prisma.$transaction([
      prisma.calendarEvent.deleteMany({ where: { source: "google" } }),
      prisma.integration.deleteMany({ where: { provider: GOOGLE_PROVIDER } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Disconnecting Google Calendar", "Unable to disconnect Google Calendar.");
  }
}
