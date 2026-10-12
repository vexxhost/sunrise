function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || undefined;
}

function normalizeHttpOrigin(value: string | undefined) {
  if (!value) return undefined;

  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function getTrustedRequestOrigin(
  headers: Pick<Headers, "get">,
  dashboardUrl?: string,
  additionalOrigins?: string,
) {
  const dashboardOrigin = normalizeHttpOrigin(dashboardUrl);
  const trustedOrigins = new Set<string>();
  if (dashboardOrigin) trustedOrigins.add(dashboardOrigin);

  for (const value of additionalOrigins?.split(",") ?? []) {
    const origin = normalizeHttpOrigin(value);
    if (origin) trustedOrigins.add(origin);
  }

  const host =
    firstForwardedValue(headers.get("x-forwarded-host")) ??
    headers.get("host")?.trim();
  const protocol = (
    firstForwardedValue(headers.get("x-forwarded-proto")) ??
    (dashboardOrigin
      ? new URL(dashboardOrigin).protocol.replace(/:$/, "")
      : undefined)
  )?.toLowerCase();

  if (!host || (protocol !== "http" && protocol !== "https")) {
    return dashboardOrigin;
  }

  try {
    const requestUrl = new URL(`${protocol}://${host}`);
    const requestOrigin =
      requestUrl.pathname === "/" &&
      !requestUrl.search &&
      !requestUrl.hash &&
      !requestUrl.username &&
      !requestUrl.password
        ? requestUrl.origin
        : undefined;

    return requestOrigin && trustedOrigins.has(requestOrigin)
      ? requestOrigin
      : dashboardOrigin;
  } catch {
    return dashboardOrigin;
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
