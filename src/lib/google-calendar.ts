import { getCategoryColor, type EventCategory } from "./categories";

export const GOOGLE_PROVIDER = "google-calendar";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars";

export interface GoogleOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  configured: boolean;
  /**
   * True when Google credentials are present but the production redirect URI is
   * missing. The integration stays disabled and the UI surfaces a configuration
   * error instead of guessing a redirect target.
   */
  misconfigured?: boolean;
}

export function getGoogleOAuthConfig(origin: string | null): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || undefined;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
  const configuredRedirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || undefined;
  const hasCredentials = Boolean(clientId && clientSecret);

  // GOOGLE_REDIRECT_URI is REQUIRED in production and must be the canonical
  // https origin. Without it we must never derive a redirect URI from the
  // (untrusted) request Host / X-Forwarded-Host, so the integration is reported
  // as not configured and the callers fail closed.
  if (!configuredRedirectUri && process.env.NODE_ENV === "production") {
    return {
      clientId,
      clientSecret,
      redirectUri: "",
      configured: false,
      misconfigured: hasCredentials,
    };
  }

  const redirectUri =
    configuredRedirectUri ??
    (origin ? `${origin}/api/integrations/google/callback` : "");
  return { clientId, clientSecret, redirectUri, configured: Boolean(hasCredentials && redirectUri) };
}

/**
 * Resolves the trusted public app origin for post-auth redirects.
 *
 * GOOGLE_REDIRECT_URI is REQUIRED in production and must be the canonical https
 * origin (e.g. `https://app.example.com`); its origin is trusted. When it is
 * absent or malformed in production this returns null so callers fail closed
 * rather than building a redirect target from the attacker-controllable request
 * Host / X-Forwarded-Host. Development keeps the request-origin convenience.
 */
export function getAppOrigin(requestUrl: URL): string | null {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Malformed env value: fall through to the fail-closed path.
    }
  }
  if (process.env.NODE_ENV === "production") return null;
  return requestUrl.origin;
}

export function isHttpsDeployment(): boolean {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) {
    try {
      return new URL(configured).protocol === "https:";
    } catch {
      return false;
    }
  }
  return process.env.NODE_ENV === "production";
}

/**
 * OAuth `state` is bound to the initiating user. The value is stored in an
 * httpOnly, SameSite=Lax cookie; the callback only accepts it when the state
 * round-trips AND the current session user matches the bound user. This blocks
 * CSRF and account-linking abuse (an attacker cannot complete their own OAuth
 * flow inside a victim's session).
 */
export interface GoogleOAuthState {
  readonly state: string;
  readonly userId: string;
}

export function serializeGoogleOAuthState(value: GoogleOAuthState): string {
  return JSON.stringify(value);
}

/** Parses the state cookie defensively; returns null for malformed values. */
export function parseGoogleOAuthState(raw: string | undefined | null): GoogleOAuthState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { state, userId } = parsed as { state?: unknown; userId?: unknown };
    if (typeof state !== "string" || state.length === 0) return null;
    if (typeof userId !== "string" || userId.length === 0) return null;
    return { state, userId };
  } catch {
    return null;
  }
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export function buildGoogleAuthUrl(config: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId ?? "",
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

async function parseTokenResponse(response: Response): Promise<GoogleTokenResponse> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "error_description" in payload
        ? String((payload as Record<string, unknown>).error_description)
        : `Google token request failed (${response.status}).`;
    throw new Error(detail);
  }
  if (!payload || typeof payload !== "object" || typeof (payload as GoogleTokenResponse).access_token !== "string") {
    throw new Error("Google returned an unexpected token response.");
  }
  return payload as GoogleTokenResponse;
}

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId ?? "",
    client_secret: config.clientSecret ?? "",
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  return parseTokenResponse(response);
}

export async function refreshGoogleAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId ?? "",
    client_secret: config.clientSecret ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  return parseTokenResponse(response);
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && typeof (payload as { email?: unknown }).email === "string") {
    return (payload as { email: string }).email;
  }
  return null;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  status?: string;
  colorId?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
}

interface GoogleEventsListResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
}

export interface GoogleEventWindow {
  timeMin: string;
  timeMax: string;
}

export async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  window: GoogleEventWindow
): Promise<GoogleCalendarEvent[]> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    const params = new URLSearchParams({
      timeMin: window.timeMin,
      timeMax: window.timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(
      `${GOOGLE_CALENDAR_API}/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );

    if (response.status === 401) {
      throw new Error("Google rejected the access token.");
    }
    if (!response.ok) {
      throw new Error(`Google Calendar request failed (${response.status}).`);
    }

    const payload = (await response.json().catch(() => null)) as GoogleEventsListResponse | null;
    if (payload?.items) {
      for (const event of payload.items) {
        if (event.status === "cancelled") continue;
        events.push(event);
      }
    }
    pageToken = payload?.nextPageToken;
    page += 1;
  } while (pageToken && page < 20);

  return events;
}

// Best-effort mapping of Google's event colors onto the app's categories. Events
// without a recognized color default to Work so they still get a category color.
const GOOGLE_COLOR_CATEGORY: Record<string, EventCategory> = {
  "1": "work",
  "7": "work",
  "9": "work",
  "3": "family",
  "4": "family",
  "11": "family",
  "2": "errands",
  "10": "errands",
};

export interface MappedCalendarEvent {
  title: string;
  date: string;
  time: string;
  color: string;
  category: EventCategory;
  source: "google";
  externalId: string;
  /** Synced Google events are personal: owned by the syncing user. */
  ownerId: string;
  familyGroupId: null;
  // Personal events must never default to the shared `family` classification;
  // synced events are treated as work availability, gated by the owner's
  // shareWorkAvailability preference.
  visibility: "work";
}

/**
 * Maps a Google event to a personal CalendarEvent for `ownerId`.
 *
 * `externalId` is namespaced with the owner id because `CalendarEvent.externalId`
 * is globally unique while Google event ids can legitimately repeat across users
 * (shared calendars, invited events). Namespacing preserves the global unique
 * constraint AND guarantees a user can only ever upsert/reconcile their own rows.
 */
export function mapGoogleEventToCalendarEvent(
  event: GoogleCalendarEvent,
  ownerId: string
): MappedCalendarEvent | null {
  const title = event.summary?.trim();
  const date = event.start?.date;
  const dateTime = event.start?.dateTime;
  if (!event.id || !title || (!date && !dateTime)) return null;

  let eventDate: string;
  let eventTime: string;
  if (dateTime) {
    eventDate = dateTime.slice(0, 10);
    eventTime = dateTime.slice(11, 16);
  } else {
    eventDate = date as string;
    eventTime = "00:00";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(eventTime)) {
    return null;
  }

  const category = (event.colorId && GOOGLE_COLOR_CATEGORY[event.colorId]) || "work";
  return {
    title,
    date: eventDate,
    time: eventTime,
    color: getCategoryColor(category) ?? "#7c5cfc",
    category,
    source: "google",
    externalId: `${ownerId}:${event.id}`,
    ownerId,
    familyGroupId: null,
    visibility: "work",
  };
}

export function getSyncWindow(): GoogleEventWindow {
  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 30);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 365);
  timeMax.setHours(23, 59, 59, 999);
  return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() };
}
