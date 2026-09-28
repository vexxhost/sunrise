import type { OidcAuthorizationPrompt } from "@/lib/oidc/sunrise";

export const AUTH_PROMPT_COOKIE = "sunrise-auth-prompt";

export function parseOidcAuthorizationPrompt(
  value: string | null | undefined,
): OidcAuthorizationPrompt | undefined {
  return value === "login" || value === "select_account" ? value : undefined;
}
