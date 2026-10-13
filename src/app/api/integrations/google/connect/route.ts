import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  buildGoogleAuthUrl,
  getAppOrigin,
  getGoogleOAuthConfig,
  GOOGLE_OAUTH_STATE_COOKIE,
  isHttpsDeployment,
  serializeGoogleOAuthState,
} from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limited = enforceRateLimit("google-connect", userId, req.headers, RATE_LIMITS.googleConnect);
  if (limited) return limited;

  const origin = getAppOrigin(new URL(req.url));
  const config = getGoogleOAuthConfig(origin);
  if (!config.configured) {
    // `origin` is null only when GOOGLE_REDIRECT_URI is missing in production.
    // Never build a Location from the request Host; a relative Location keeps
    // the redirect same-origin.
    if (!origin) {
      return new NextResponse(null, {
        status: 307,
        headers: { Location: "/settings?google=not-configured" },
      });
    }
    return NextResponse.redirect(new URL("/settings?google=not-configured", origin));
  }

  const state = crypto.randomUUID();
  const response = NextResponse.redirect(buildGoogleAuthUrl(config, state));
  // Bind the random state to this user; the callback rejects any mismatch.
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, serializeGoogleOAuthState({ state, userId }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: isHttpsDeployment(),
  });
  return response;
}
