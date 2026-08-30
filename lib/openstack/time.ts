const TIMEZONE_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * OpenStack APIs commonly return UTC timestamps without an explicit timezone.
 * Preserve timestamps that already declare an offset and mark naive values as UTC.
 */
export function normalizeOpenStackTimestamp(value: string) {
  return TIMEZONE_SUFFIX.test(value) ? value : `${value}Z`;
}
