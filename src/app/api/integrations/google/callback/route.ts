import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  exchangeGoogleCode,
  fetchGoogleAccountEmail,
  getAppOrigin,
  getGoogleOAuthConfig,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_PROVIDER,
  parseGoogleOAuthState,
} from "@/lib/google-calendar";

const MAX_OAUTH_PARAM_LENGTH = 2048;

function settingsUrl(origin: string, params: Record<string, string>): URL {
  const url = new URL("/settings", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

// Fail-closed redirect used when there is no trusted origin (GOOGLE_REDIRECT_URI
// missing in production). A relative Location avoids deriving the target host
// from the attacker-controllable request Host / X-Forwarded-Host.
function relativeSettingsRedirect(params: Record<string, string>): NextResponse {
  const query = new URLSearchParams(params).toString();
  return new NextResponse(null, {
    status: 307,
    headers: { Location: query ? `/settings?${query}` : "/settings" },
  });
}

export async function GET(req: NextRequest) {
  const origin = getAppOrigin(new URL(req.url));
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const cookieState = parseGoogleOAuthState(req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value);

  const redirect = (params: Record<string, string>) => {
    const response = origin
      ? NextResponse.redirect(settingsUrl(origin, params))
      : relativeSettingsRedirect(params);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  };

  if (oauthError) {
    // Only echo a short, safe token back to the UI — never the raw provider text.
    const reason = /^[a-z_]{1,40}$/i.test(oauthError) ? oauthError : "provider-error";
    return redirect({ google: "error", reason });
  }

  if (
    !code ||
    !state ||
    code.length > MAX_OAUTH_PARAM_LENGTH ||
    state.length > MAX_OAUTH_PARAM_LENGTH ||
    !cookieState ||
    state !== cookieState.state
  ) {
    return redirect({ google: "error", reason: "invalid-state" });
  }

  // The OAuth state is bound to the initiating user; reject if the session that
  // returns the code is not that same user. Closes CSRF/account-linking abuse.
  const userId = await requireUserId();
  if (!userId || userId !== cookieState.userId) {
    return redirect({ google: "error", reason: "invalid-state" });
  }

  const limited = enforceRateLimit("google-callback", userId, req.headers, RATE_LIMITS.googleCallback);
  if (limited) return limited;

  const config = getGoogleOAuthConfig(origin);
  if (!config.configured) {
    return redirect({ google: "not-configured" });
  }

  try {
    const tokens = await exchangeGoogleCode(config, code);
    const accountEmail = await fetchGoogleAccountEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.integration.upsert({
      where: { provider_userId: { provider: GOOGLE_PROVIDER, userId } },
      update: {
        userId,
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
        userId,
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
    // Never log the raw error (or token material). A coarse name is enough for
    // ops to distinguish a provider rejection from an unexpected failure.
    console.error(
      "Google Calendar OAuth callback failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return redirect({ google: "error", reason: "token-exchange" });
  }
}
