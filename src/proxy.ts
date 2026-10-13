import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isClerkConfigured, isKeylessDevMode } from "@/lib/clerk-config";

// The only routes reachable without a session. Everything else (pages and API
// routes) is gated. The Google callback is public here but performs its own
// session + OAuth-state verification (see requirement: state is bound to the
// initiating user), so a missing session still yields no tokens.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",
  "/api/integrations/google/callback",
]);

function isApiRequest(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/** True when `origin`'s host matches the request host or the configured public origin. */
function isAllowedOrigin(origin: string, request: NextRequest): boolean {
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // Malformed or opaque ("null") Origin: reject.
    return false;
  }
  if (originHost === request.nextUrl.host) return true;

  // Behind a TLS-terminating proxy the request host may be internal while the
  // browser sends the canonical public origin. GOOGLE_REDIRECT_URI is the one
  // configured canonical origin in this app.
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) {
    try {
      if (new URL(configured).host === originHost) return true;
    } catch {
      // Ignore a malformed configured value.
    }
  }
  return false;
}

/**
 * CSRF defense-in-depth for state-changing API requests. Clerk's SameSite
 * cookies are the primary CSRF control; this is an additional check.
 *
 * Non-GET/HEAD `/api/*` requests carrying an `Origin` header are rejected when
 * that origin's host is neither the request host nor a configured public origin.
 * Requests without an `Origin` header (server-to-server, non-browser clients)
 * are allowed.
 */
function isCrossOriginApiRequest(request: NextRequest): boolean {
  if (!isApiRequest(request.nextUrl.pathname)) return false;
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return !isAllowedOrigin(origin, request);
}

/**
 * Fail-closed auth gate.
 *
 * Production default: if Clerk is not configured, the app refuses to serve any
 * protected route. Pages redirect to /sign-in; API routes return 401 JSON. The
 * keyless "no auth" mode is now available only in non-production development
 * (see `isKeylessDevMode`). This prevents a production misconfiguration from
 * silently exposing all data under a shared identity.
 */
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Applies to both the keyless-dev and Clerk branches below.
  if (isCrossOriginApiRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  if (!isClerkConfigured()) {
    // Development convenience: only reachable when NODE_ENV !== "production".
    if (isKeylessDevMode()) {
      return NextResponse.next();
    }

    // Production with no usable keys: fail closed.
    if (isPublicRoute(request)) {
      return NextResponse.next();
    }
    if (isApiRequest(request.nextUrl.pathname)) {
      return NextResponse.json(
        { error: "Authentication is not configured." },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return clerkMiddleware(async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  })(request, event);
}

// Run on every request except Next.js internals and static assets.
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
