function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || undefined;
}

export function getRequestOrigin(
  headers: Pick<Headers, "get">,
  fallbackUrl?: string,
) {
  let fallbackOrigin: string | undefined;
  let fallbackProtocol: string | undefined;
  try {
    if (fallbackUrl) {
      const fallback = new URL(fallbackUrl);
      fallbackOrigin = fallback.origin;
      fallbackProtocol = fallback.protocol.replace(/:$/, "");
    }
  } catch {
    // A malformed fallback must not prevent request-derived origin handling.
  }

  const host =
    firstForwardedValue(headers.get("x-forwarded-host")) ??
    headers.get("host")?.trim();
  const protocol = (
    firstForwardedValue(headers.get("x-forwarded-proto")) ?? fallbackProtocol
  )?.toLowerCase();

  if (!host || (protocol !== "http" && protocol !== "https")) {
    return fallbackOrigin;
  }

  try {
    const origin = new URL(`${protocol}://${host}`);
    return origin.host.toLowerCase() === host.toLowerCase()
      ? origin.origin
      : fallbackOrigin;
  } catch {
    return fallbackOrigin;
  }
}

export function isSameOriginRequest(
  headers: Pick<Headers, "get">,
  fallbackOrigin: string,
) {
  const origin = headers.get("origin");
  if (!origin) return true;

  try {
    const supplied = new URL(origin);
    const fallback = new URL(fallbackOrigin);
    const host =
      firstForwardedValue(headers.get("x-forwarded-host")) ??
      headers.get("host") ??
      fallback.host;
    const protocol =
      firstForwardedValue(headers.get("x-forwarded-proto")) ??
      fallback.protocol.replace(/:$/, "");

    return supplied.host === host && supplied.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}
