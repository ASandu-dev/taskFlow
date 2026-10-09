import { NextRequest, NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  getAppOrigin,
  getGoogleOAuthConfig,
  GOOGLE_OAUTH_STATE_COOKIE,
  isHttpsDeployment,
} from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  const origin = getAppOrigin(new URL(req.url));
  const config = getGoogleOAuthConfig(origin);
  if (!config.configured) {
    return NextResponse.redirect(new URL("/settings?google=not-configured", origin));
  }

  const state = crypto.randomUUID();
  const response = NextResponse.redirect(buildGoogleAuthUrl(config, state));
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: isHttpsDeployment(),
  });
  return response;
}
