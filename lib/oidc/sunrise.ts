import "server-only";
import { randomBytes, createHash } from "crypto";
import { getFederationProviderConfig } from "@/lib/federation/config";
import type { SunriseIdentity } from "@/lib/session";

/**
 * OIDC client config for the unified Sunrise login flow.
 *
 * Sunrise itself acts as the OIDC Relying Party against Keycloak using a
 * confidential client (`sunrise-server`). The user-driven Authorization Code
 * + PKCE flow yields the user's real Keycloak id/access/refresh tokens, which
 * we then use to federate into Keystone and, when S3 is enabled, obtain RGW
 * STS credentials with AssumeRoleWithWebIdentity. The confidential client is
 * registered as an RGW OIDC audience and carries the required role and session
 * tag claims, so both cloud sessions share one refresh-token lifecycle.
 *
 * One user-visible login → both Keystone session and S3 STS creds.
 */

export const OIDC_LOGIN_PATH = "/auth/oidc/login";
export const OIDC_CALLBACK_PATH = "/auth/oidc/callback";
export const OIDC_REFRESH_TIMEOUT_MS = 30_000;

export type SunriseOidcConfig = {
  identityProvider: string;
  protocol: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  rgwStsDurationSeconds: number;
};

export type OidcAuthorizationPrompt = "login" | "select_account";

export function getSunriseOidcConfig(
  identityProvider: string,
): SunriseOidcConfig {
  const provider = getFederationProviderConfig(identityProvider);
  const dashboardUrl = process.env.SUNRISE_DASHBOARD_URL;
  if (!dashboardUrl) throw new Error("SUNRISE_DASHBOARD_URL not set");
  return {
    identityProvider,
    protocol: provider.protocol,
    issuer: provider.issuer,
    clientId: provider.clientId,
    clientSecret: provider.clientSecret,
    redirectUri: `${dashboardUrl}${OIDC_CALLBACK_PATH}`,
    rgwStsDurationSeconds: provider.rgwStsDurationSeconds,
  };
}

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  userinfo_endpoint?: string;
};

const discoveryCache = new Map<
  string,
  { value: OidcDiscovery; fetchedAt: number }
>();

export async function discoverOidc(
  identityProvider: string,
  signal?: AbortSignal,
): Promise<OidcDiscovery> {
  const { issuer } = getSunriseOidcConfig(identityProvider);
  const cached = discoveryCache.get(issuer);
  if (cached && Date.now() - cached.fetchedAt < 5 * 60_000) {
    return cached.value;
  }
  const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const value = (await res.json()) as OidcDiscovery;
  discoveryCache.set(issuer, { value, fetchedAt: Date.now() });
  return value;
}

type IdTokenClaims = {
  aud?: string | string[];
  azp?: string;
  email?: string;
  exp?: number;
  iss?: string;
  name?: string;
  preferred_username?: string;
  sub?: string;
};

function decodeIdTokenClaims(idToken: string): IdTokenClaims | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;

  try {
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as IdTokenClaims;
  } catch {
    return null;
  }
}

export function extractOidcIdentity(
  idToken: string,
  identityProvider: string,
): SunriseIdentity | null {
  const claims = decodeIdTokenClaims(idToken);
  if (!claims?.sub || !claims.iss) return null;

  const { issuer, clientId } = getSunriseOidcConfig(identityProvider);
  const audiences = Array.isArray(claims.aud)
    ? claims.aud
    : claims.aud
      ? [claims.aud]
      : [];
  const intendedForClient =
    audiences.includes(clientId) || claims.azp === clientId;
  const expired =
    typeof claims.exp === "number" && claims.exp * 1000 <= Date.now();

  if (claims.iss !== issuer || !intendedForClient || expired) return null;

  const email = claims.email?.trim() || undefined;
  const preferredUsername = claims.preferred_username?.trim() || undefined;
  const displayName =
    claims.name?.trim() || preferredUsername || email || claims.sub;

  return {
    subject: claims.sub,
    displayName,
    email,
    preferredUsername,
    issuer: claims.iss,
    identityProvider,
  };
}

export async function resolveOidcIdentity(
  accessToken: string,
  idToken: string,
  identityProvider: string,
): Promise<SunriseIdentity | null> {
  const tokenIdentity = extractOidcIdentity(idToken, identityProvider);

  try {
    const { userinfo_endpoint } = await discoverOidc(identityProvider);
    if (!userinfo_endpoint) return tokenIdentity;

    const response = await fetch(userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) return tokenIdentity;

    const claims = (await response.json()) as IdTokenClaims;
    if (!claims.sub) return tokenIdentity;
    if (tokenIdentity && claims.sub !== tokenIdentity.subject) return null;

    const { issuer } = getSunriseOidcConfig(identityProvider);
    const email = claims.email?.trim() || undefined;
    const preferredUsername = claims.preferred_username?.trim() || undefined;
    return {
      subject: claims.sub,
      displayName:
        claims.name?.trim() || preferredUsername || email || claims.sub,
      email,
      preferredUsername,
      issuer,
      identityProvider,
    };
  } catch (error) {
    console.warn("Unable to load OIDC UserInfo; using ID token claims:", error);
    return tokenIdentity;
  }
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generatePkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function generateState() {
  return base64url(randomBytes(16));
}

export type CodeExchangeResult = {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

export type RefreshTokenResult = Omit<CodeExchangeResult, "id_token"> & {
  id_token?: string;
};

export async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  identityProvider: string,
): Promise<CodeExchangeResult> {
  const { token_endpoint } = await discoverOidc(identityProvider);
  const { clientId, clientSecret, redirectUri } =
    getSunriseOidcConfig(identityProvider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OIDC code exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as CodeExchangeResult;
}

export async function refreshAccessToken(
  refreshToken: string,
  identityProvider: string,
): Promise<RefreshTokenResult> {
  const signal = AbortSignal.timeout(OIDC_REFRESH_TIMEOUT_MS);
  const { token_endpoint } = await discoverOidc(identityProvider, signal);
  const { clientId, clientSecret } = getSunriseOidcConfig(identityProvider);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body,
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OIDC refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RefreshTokenResult;
}

export async function buildAuthorizeUrl(opts: {
  identityProvider: string;
  challenge: string;
  state: string;
  scope?: string;
  prompt?: OidcAuthorizationPrompt;
}): Promise<string> {
  const { authorization_endpoint } = await discoverOidc(opts.identityProvider);
  const { clientId, redirectUri } = getSunriseOidcConfig(opts.identityProvider);
  const url = new URL(authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", opts.scope ?? "openid profile email");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (opts.prompt) url.searchParams.set("prompt", opts.prompt);
  return url.toString();
}

export async function buildEndSessionUrl(opts: {
  identityProvider: string;
  postLogoutRedirectUri: string;
  idTokenHint?: string;
}): Promise<string | null> {
  const { end_session_endpoint } = await discoverOidc(opts.identityProvider);
  if (!end_session_endpoint) return null;

  const { clientId } = getSunriseOidcConfig(opts.identityProvider);
  const url = new URL(end_session_endpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("post_logout_redirect_uri", opts.postLogoutRedirectUri);
  if (opts.idTokenHint) {
    url.searchParams.set("id_token_hint", opts.idTokenHint);
  }
  return url.toString();
}
