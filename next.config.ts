import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy is shipped in REPORT-ONLY mode.
//
// Rationale: Clerk's Frontend API host varies by deployment (a Clerk-hosted
// domain, a custom subdomain, or a proxied same-origin path), and it relies on
// inline bootstrap scripts plus Cloudflare Turnstile. An enforcing policy would
// need hands-on browser verification for sign-in/sign-up/account flows, which
// cannot be done here. Report-Only records violations without breaking auth.
//
// To promote this to enforcing: confirm zero violations for Clerk sign-in,
// sign-up, and profile flows in the browser, then rename the header key to
// `Content-Security-Policy`. `'unsafe-inline'` is required by Clerk's inline
// bootstrap; `'unsafe-eval'` is added only in development (React debugging).
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://clerk.com https://*.clerk.com https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://img.clerk.com https://*.clerk.com https://*.clerk.accounts.dev",
  "font-src 'self' data:",
  "connect-src 'self' https://*.clerk.accounts.dev https://clerk.com https://*.clerk.com https://api.clerk.com https://accounts.google.com https://oauth2.googleapis.com https://openidconnect.googleapis.com https://www.googleapis.com https://challenges.cloudflare.com",
  "frame-src 'self' https://*.clerk.accounts.dev https://clerk.com https://*.clerk.com https://challenges.cloudflare.com",
  "media-src 'self'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
