function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || undefined;
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
