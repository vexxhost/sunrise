import 'server-only';
import { randomBytes, createHash } from 'crypto';

/**
 * OIDC client config for the unified Sunrise login flow.
 *
 * Sunrise itself acts as the OIDC Relying Party against Keycloak using a
 * confidential client (`sunrise-server`). The user-driven Authorization Code
 * + PKCE flow yields the user's real Keycloak id/access/refresh tokens, which
 * we then:
 *   1. Federate into Keystone (bearer-token federation endpoint) to obtain
 *      an unscoped Keystone token.
 *   2. Exchange (RFC 8693 token-exchange) for an `rgw-client-public-browser`
 *      audience id_token, fed to RGW STS AssumeRoleWithWebIdentity to get
 *      S3 temp credentials.
 *
 * One user-visible login → both Keystone session and S3 STS creds.
 */

export const OIDC_LOGIN_PATH = '/auth/oidc/login';
export const OIDC_CALLBACK_PATH = '/auth/oidc/callback';

export type SunriseOidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  rgwAudience: string;
};

export function getSunriseOidcConfig(): SunriseOidcConfig {
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_SERVER_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_SERVER_CLIENT_SECRET;
  const dashboardUrl = process.env.DASHBOARD_URL;
  const rgwAudience = process.env.KEYCLOAK_S3_CLIENT_ID;
  if (!issuer) throw new Error('KEYCLOAK_ISSUER not set');
  if (!clientId) throw new Error('KEYCLOAK_SERVER_CLIENT_ID not set');
  if (!clientSecret) throw new Error('KEYCLOAK_SERVER_CLIENT_SECRET not set');
  if (!dashboardUrl) throw new Error('DASHBOARD_URL not set');
  if (!rgwAudience) throw new Error('KEYCLOAK_S3_CLIENT_ID not set');
  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri: `${dashboardUrl}${OIDC_CALLBACK_PATH}`,
    rgwAudience,
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
  const { issuer } = getSunriseOidcConfig();
  const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const value = (await res.json()) as OidcDiscovery;
  discoveryCache = { value, fetchedAt: Date.now() };
  return value;
}

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generatePkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(
    createHash('sha256').update(verifier).digest()
  );
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

export async function exchangeCodeForTokens(
  code: string,
  verifier: string
): Promise<CodeExchangeResult> {
  const { token_endpoint } = await discoverOidc();
  const { clientId, clientSecret, redirectUri } = getSunriseOidcConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OIDC code exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as CodeExchangeResult;
}

export type TokenExchangeResult = {
  access_token: string;
  id_token?: string;
  issued_token_type: string;
  token_type: string;
  expires_in?: number;
};

/**
 * RFC 8693 token-exchange. Asks Keycloak to mint a token whose `aud` matches
 * the RGW STS client. Authenticates with the confidential `sunrise-server`
 * client. Requires that Keycloak token-exchange feature is enabled and that
 * `sunrise-server` is permitted to exchange to the target audience.
 */
export async function tokenExchangeForRgw(
  subjectAccessToken: string
): Promise<TokenExchangeResult> {
  const { token_endpoint } = await discoverOidc();
  const { clientId, clientSecret, rgwAudience } = getSunriseOidcConfig();
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: subjectAccessToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    // Keycloak < 26 (legacy token-exchange) cannot mint id_tokens here and
    // returns `requested_token_type unsupported`. We request access_token
    // instead; RGW STS validates it like any other JWT (signature + aud).
    // The audience mapper on `sunrise-server` ensures aud contains the RGW
    // client id. Switch to id_token once Keycloak is upgraded to 26+ with
    // `--features=token-exchange-standard-v2`.
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    audience: rgwAudience,
  });
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token-exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TokenExchangeResult;
}

export async function buildAuthorizeUrl(opts: {
  challenge: string;
  state: string;
  scope?: string;
}): Promise<string> {
  const { authorization_endpoint } = await discoverOidc();
  const { clientId, redirectUri } = getSunriseOidcConfig();
  const url = new URL(authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', opts.scope ?? 'openid profile email');
  url.searchParams.set('state', opts.state);
  url.searchParams.set('code_challenge', opts.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}
