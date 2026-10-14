import type { OidcAuthorizationPrompt } from "@/lib/oidc/sunrise";
import type { SessionExpiryReason } from "@/lib/session-lifetime";
import { normalizeAuthReturnTo } from "@/lib/auth-return";

type BrowserLocation = Pick<Location, "pathname" | "search" | "hash">;

export function authReturnToFromLocation(location: BrowserLocation): string {
  return normalizeAuthReturnTo(
    `${location.pathname}${location.search}${location.hash}`,
  );
}

export function identityProviderSignInPath(
  signInSlug: string,
  returnTo = "/",
  prompt?: OidcAuthorizationPrompt,
): string {
  const path = `/sign-in/${encodeURIComponent(signInSlug)}`;
  const params = new URLSearchParams();
  const normalizedReturnTo = normalizeAuthReturnTo(returnTo);
  if (normalizedReturnTo !== "/") params.set("returnTo", normalizedReturnTo);
  if (prompt) params.set("prompt", prompt);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function sessionLogoutPath(
  reason: SessionExpiryReason,
  returnTo: string,
  mode?: "switch",
): string {
  const params = new URLSearchParams({ reason });
  if (mode) params.set("mode", mode);
  const normalizedReturnTo = normalizeAuthReturnTo(returnTo);
  if (normalizedReturnTo !== "/") params.set("returnTo", normalizedReturnTo);
  return `/auth/logout?${params.toString()}`;
}
