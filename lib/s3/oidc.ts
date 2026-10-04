import { randomBytes, createHash } from "crypto";
import { getFederationProviderConfig } from "@/lib/federation/config";

export const OIDC_REDIRECT_PATH = "/object-storage/auth/callback";
export const OBJECT_STORAGE_HOME_PATH = "/object-storage";
export const MAX_OBJECT_STORAGE_RETURN_TO_LENGTH = 256;

function objectStorageSectionPath(pathname: string) {
  if (
    pathname === `${OBJECT_STORAGE_HOME_PATH}/buckets` ||
    pathname.startsWith(`${OBJECT_STORAGE_HOME_PATH}/buckets/`)
  ) {
    return `${OBJECT_STORAGE_HOME_PATH}/buckets`;
  }
  if (
    pathname === `${OBJECT_STORAGE_HOME_PATH}/roles` ||
    pathname.startsWith(`${OBJECT_STORAGE_HOME_PATH}/roles/`)
  ) {
    return `${OBJECT_STORAGE_HOME_PATH}/roles`;
  }
  return OBJECT_STORAGE_HOME_PATH;
}

export function normalizeObjectStorageReturnTo(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return OBJECT_STORAGE_HOME_PATH;
  }

  const url = new URL(value, "http://localhost");
  const isObjectStoragePage =
    url.pathname === OBJECT_STORAGE_HOME_PATH ||
    url.pathname.startsWith(`${OBJECT_STORAGE_HOME_PATH}/`);
  const isAuthPage = url.pathname.startsWith(
    `${OBJECT_STORAGE_HOME_PATH}/auth/`,
  );

  if (!isObjectStoragePage || isAuthPage) {
    return OBJECT_STORAGE_HOME_PATH;
  }

  const returnTo = `${url.pathname}${url.search}${url.hash}`;
  return returnTo.length <= MAX_OBJECT_STORAGE_RETURN_TO_LENGTH
    ? returnTo
    : objectStorageSectionPath(url.pathname);
}

export function getOidcConfig(identityProvider: string) {
  const provider = getFederationProviderConfig(identityProvider);
  const rgw = provider.rgw;
  const dashboardUrl = process.env.DASHBOARD_URL;
  if (!rgw) {
    throw new Error(
      `RGW OIDC is not configured for Identity Provider ${identityProvider}`,
    );
  }
  if (!dashboardUrl) throw new Error("DASHBOARD_URL not set");
  return {
    identityProvider,
    issuer: provider.issuer,
    clientId: rgw.clientId,
    stsDurationSeconds: rgw.stsDurationSeconds,
    dashboardUrl,
    redirectUri: `${dashboardUrl}${OIDC_REDIRECT_PATH}`,
  };
}

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
};

const discoveryCache = new Map<
  string,
  { value: OidcDiscovery; fetchedAt: number }
>();

export async function discoverOidc(
  identityProvider: string,
): Promise<OidcDiscovery> {
  const { issuer } = getOidcConfig(identityProvider);
  const cached = discoveryCache.get(issuer);
  if (cached && Date.now() - cached.fetchedAt < 5 * 60_000) {
    return cached.value;
  }
  const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const value = (await res.json()) as OidcDiscovery;
  discoveryCache.set(issuer, { value, fetchedAt: Date.now() });
  return value;
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

export async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  identityProvider: string,
) {
  const { token_endpoint } = await discoverOidc(identityProvider);
  const { clientId, redirectUri } = getOidcConfig(identityProvider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };
}

export type S3OidcRefreshResult = {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

export async function refreshS3Tokens(
  refreshToken: string,
  identityProvider: string,
): Promise<S3OidcRefreshResult> {
  const { token_endpoint } = await discoverOidc(identityProvider);
  const { clientId } = getOidcConfig(identityProvider);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`S3 OIDC refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as S3OidcRefreshResult;
}
