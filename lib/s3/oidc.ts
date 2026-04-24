import { randomBytes, createHash } from 'crypto';

export const OIDC_REDIRECT_PATH = '/object-storage/auth/callback';

export function getOidcConfig() {
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_S3_CLIENT_ID;
  const dashboardUrl = process.env.DASHBOARD_URL;
  if (!issuer) throw new Error('KEYCLOAK_ISSUER not set');
  if (!clientId) throw new Error('KEYCLOAK_S3_CLIENT_ID not set');
  if (!dashboardUrl) throw new Error('DASHBOARD_URL not set');
  return {
    issuer,
    clientId,
    redirectUri: `${dashboardUrl}${OIDC_REDIRECT_PATH}`,
  };
}

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
};

let discoveryCache: { value: OidcDiscovery; fetchedAt: number } | null = null;

export async function discoverOidc(): Promise<OidcDiscovery> {
  if (discoveryCache && Date.now() - discoveryCache.fetchedAt < 5 * 60_000) {
    return discoveryCache.value;
  }
  const { issuer } = getOidcConfig();
  const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const value = (await res.json()) as OidcDiscovery;
  discoveryCache = { value, fetchedAt: Date.now() };
  return value;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generatePkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function generateState() {
  return base64url(randomBytes(16));
}

export async function exchangeCodeForTokens(code: string, verifier: string) {
  const { token_endpoint } = await discoverOidc();
  const { clientId, redirectUri } = getOidcConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
