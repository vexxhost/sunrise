export const SUNRISE_REQUEST_ID_HEADER = "x-sunrise-request-id";

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSunriseRequestId() {
  return crypto.randomUUID();
}

export function validSunriseRequestId(value: string | undefined) {
  return value && REQUEST_ID_PATTERN.test(value) ? value : undefined;
}

export function sunriseRequestIdFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined>,
) {
  if (headers instanceof Headers) {
    return validSunriseRequestId(
      headers.get(SUNRISE_REQUEST_ID_HEADER) ?? undefined,
    );
  }
  const matchingEntry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === SUNRISE_REQUEST_ID_HEADER,
  );
  const value = matchingEntry?.[1];
  return validSunriseRequestId(Array.isArray(value) ? value[0] : value);
}
