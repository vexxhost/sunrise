const DEFAULT_AUTH_RETURN_TO = "/";
const MAX_AUTH_RETURN_TO_LENGTH = 512;

export function normalizeAuthReturnTo(value?: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_RETURN_TO;
  }

  const url = new URL(value, "http://localhost");
  if (
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/object-storage/auth/") ||
    url.pathname.startsWith("/_next/")
  ) {
    return DEFAULT_AUTH_RETURN_TO;
  }

  const returnTo = `${url.pathname}${url.search}${url.hash}`;
  return returnTo.length <= MAX_AUTH_RETURN_TO_LENGTH
    ? returnTo
    : DEFAULT_AUTH_RETURN_TO;
}
