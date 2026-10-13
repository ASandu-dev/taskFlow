import { connection, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth";
import { getAppOrigin, getGoogleOAuthConfig, GOOGLE_PROVIDER } from "@/lib/google-calendar";
import type { IntegrationStatus } from "@/types";

export async function GET(req: NextRequest) {
  await connection();
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    const config = getGoogleOAuthConfig(getAppOrigin(new URL(req.url)));
    // Per-user integration: never read another user's tokens/account email.
    const integration = await prisma.integration.findUnique({
      where: { provider_userId: { provider: GOOGLE_PROVIDER, userId } },
    });

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
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    await prisma.$transaction([
      // Only the caller's synced events and their own integration row.
      prisma.calendarEvent.deleteMany({ where: { source: "google", ownerId: userId } }),
      prisma.integration.deleteMany({ where: { provider: GOOGLE_PROVIDER, userId } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Disconnecting Google Calendar", "Unable to disconnect Google Calendar.");
  }
}
