/**
 * Common IANA timezone choices for the event forms. The server validates any
 * value with `Intl.DateTimeFormat`, so this list only needs to cover the zones
 * users are most likely to pick — the browser's own zone is appended when it is
 * missing so a round-tripped event always stays selectable.
 */

export interface TimeZoneOption {
  value: string;
  label: string;
}

export const COMMON_TIMEZONES: readonly TimeZoneOption[] = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York (Eastern)" },
  { value: "America/Chicago", label: "Chicago (Central)" },
  { value: "America/Denver", label: "Denver (Mountain)" },
  { value: "America/Los_Angeles", label: "Los Angeles (Pacific)" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Madrid", label: "Madrid" },
  { value: "Europe/Bucharest", label: "Bucharest" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Africa/Cairo", label: "Cairo" },
  { value: "Africa/Johannesburg", label: "Johannesburg" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "Kolkata" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Pacific/Auckland", label: "Auckland" },
];

/** The browser's IANA zone, or "UTC" when it cannot be resolved. */
export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Options for the select, always including `value` so an event fetched from the
 * server with an unusual zone does not silently reset to the first option.
 */
export function getTimeZoneOptions(value: string | null | undefined): TimeZoneOption[] {
  const options = [...COMMON_TIMEZONES];
  if (value && !options.some((option) => option.value === value)) {
    options.push({ value, label: value });
  }
  return options;
}
