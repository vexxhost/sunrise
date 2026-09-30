import { formatDistance } from "date-fns";

const TIMEZONE_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * OpenStack APIs commonly return UTC timestamps without an explicit timezone.
 * Preserve timestamps that already declare an offset and mark naive values as UTC.
 */
export function normalizeOpenStackTimestamp(value: string) {
  return TIMEZONE_SUFFIX.test(value) ? value : `${value}Z`;
}

export function formatAge(value: unknown, now: Date | number = Date.now()) {
  if (typeof value !== "string" || !value.trim()) return "-";

  const timestamp = Date.parse(normalizeOpenStackTimestamp(value));
  if (Number.isNaN(timestamp)) return "-";

  return formatDistance(timestamp, now);
}

/**
 * Render an OpenStack timestamp identically during server rendering and browser
 * hydration. An explicit UTC representation avoids locale and timezone drift.
 */
export function formatUtcTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "-";

  const timestamp = new Date(normalizeOpenStackTimestamp(value));
  if (Number.isNaN(timestamp.getTime())) return value;

  return timestamp
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}
