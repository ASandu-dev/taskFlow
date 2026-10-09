import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exchangeGoogleCode,
  fetchGoogleAccountEmail,
  getAppOrigin,
  getGoogleOAuthConfig,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_PROVIDER,
} from "@/lib/google-calendar";

function settingsUrl(origin: string, params: Record<string, string>): URL {
  const url = new URL("/settings", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function GET(req: NextRequest) {
  const origin = getAppOrigin(new URL(req.url));
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const cookieState = req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  const redirect = (params: Record<string, string>) => {
    const response = NextResponse.redirect(settingsUrl(origin, params));
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  };

  if (oauthError) {
    return redirect({ google: "error", reason: oauthError });
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return redirect({ google: "error", reason: "invalid-state" });
  }

  const config = getGoogleOAuthConfig(origin);
  if (!config.configured) {
    return redirect({ google: "not-configured" });
  }

  try {
    const tokens = await exchangeGoogleCode(config, code);
    const accountEmail = await fetchGoogleAccountEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.integration.upsert({
      where: { provider: GOOGLE_PROVIDER },
      update: {
        connected: true,
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        tokenType: tokens.token_type ?? null,
        scope: tokens.scope ?? null,
        expiresAt,
        accountEmail,
        lastSyncError: null,
      },
      create: {
        provider: GOOGLE_PROVIDER,
        connected: true,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenType: tokens.token_type ?? null,
        scope: tokens.scope ?? null,
        expiresAt,
        accountEmail,
      },
    });

    return redirect({ google: "connected" });
  } catch (error) {
    console.error("Google Calendar OAuth callback failed", error);
    return redirect({ google: "error", reason: "token-exchange" });
  }
}
