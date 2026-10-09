import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/clerk-config";

// Routes that do not require authentication. Everything else (pages and API
// routes) redirects to /sign-in until the user is signed in.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",
  // The Google Calendar OAuth flow may return here without a session (e.g. the
  // code exchange happens before the user is redirected back into the app).
  "/api/integrations/google/callback",
]);

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  // While only placeholder Clerk keys are configured, run without the auth
  // gate so the app keeps working until real keys are added.
  if (!isClerkConfigured()) {
    return NextResponse.next();
  }
  return clerkMiddleware(async (auth, request) => {
    if (!isPublicRoute(request)) {
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