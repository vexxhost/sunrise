import { NextResponse } from "next/server";
import { AUTH_PROMPT_COOKIE } from "@/lib/auth-prompt";
import {
  buildEndSessionUrl,
  refreshAccessToken,
  type OidcAuthorizationPrompt,
} from "@/lib/oidc/sunrise";
import {
  destroySessionActivity,
  destroySession,
  getSession,
  SESSION_ACTIVITY_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/session";
import {
  parseSessionExpiryReason,
  SESSION_EXPIRY_NOTICE_COOKIE,
  type SessionExpiryReason,
} from "@/lib/session-lifetime";

const KEYSTONE_API = process.env.KEYSTONE_API;

async function revokeToken(subjectToken: string, authToken: string) {
  if (!KEYSTONE_API) {
    return;
  }

  try {
    const response = await fetch(`${KEYSTONE_API}/v3/auth/tokens`, {
      method: "DELETE",
      headers: {
        "X-Auth-Token": authToken,
        "X-Subject-Token": subjectToken,
      },
      cache: "no-store",
    });

    if (!response.ok && response.status !== 404) {
      console.error(
        "Failed to revoke Keystone token:",
        response.status,
        response.statusText,
      );
    }
  } catch (error) {
    console.error("Error revoking Keystone token:", error);
  }
}

function dashboardUrl() {
  return new URL(
    "/",
    process.env.SUNRISE_DASHBOARD_URL || "http://localhost",
  ).toString();
}

function oidcLoginUrl(identityProvider: string) {
  const url = new URL("/auth/oidc/login", dashboardUrl());
  url.searchParams.set("idp", identityProvider);
  return url.toString();
}

async function logoutIdToken(identityProvider?: string, refreshToken?: string) {
  if (!identityProvider || !refreshToken) return undefined;

  try {
    const refreshed = await refreshAccessToken(refreshToken, identityProvider);
    return refreshed.id_token;
  } catch (error) {
    console.warn("Unable to refresh the OIDC ID token for logout:", error);
    return undefined;
  }
}

async function providerLogoutUrl(
  identityProvider?: string,
  idTokenHint?: string,
) {
  if (!identityProvider) return null;

  try {
    return await buildEndSessionUrl({
      identityProvider,
      postLogoutRedirectUri: dashboardUrl(),
      idTokenHint,
    });
  } catch (error) {
    console.warn("Unable to discover the OIDC logout endpoint:", error);
    return null;
  }
}

async function performLogout(
  prompt: OidcAuthorizationPrompt,
  expiryReason?: SessionExpiryReason,
) {
  const session = await getSession({ allowExpired: true });
  const unscoped = session.keystone_unscoped_token;
  const scoped = session.keystoneProjectToken;
  const refreshToken = session.keycloakRefreshToken;
  const identityProvider =
    session.federationIdentityProvider ??
    session.oidcIdentity?.identityProvider;
  const reuseProviderSession = Boolean(
    expiryReason && prompt === "login" && identityProvider,
  );

  // An expired Sunrise session may begin a fresh local session from a still
  // valid Keycloak SSO session. Explicit sign-out and account switching still
  // terminate the provider session.
  const [idTokenHint] = await Promise.all([
    reuseProviderSession
      ? Promise.resolve(undefined)
      : logoutIdToken(identityProvider, refreshToken),
    scoped && unscoped ? revokeToken(scoped, unscoped) : Promise.resolve(),
    unscoped ? revokeToken(unscoped, unscoped) : Promise.resolve(),
  ]);
  const endSessionUrl = reuseProviderSession
    ? null
    : await providerLogoutUrl(identityProvider, idTokenHint);

  await destroySession(session);
  await destroySessionActivity();

  const destination =
    reuseProviderSession && identityProvider
      ? oidcLoginUrl(identityProvider)
      : (endSessionUrl ?? dashboardUrl());
  const response = NextResponse.redirect(destination, { status: 303 });
  // Defensively clear the session cookie on the redirect response itself,
  // in case iron-session's destroy() doesn't propagate through the redirect.
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.set(SESSION_ACTIVITY_COOKIE_NAME, "", {
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.set(SESSION_EXPIRY_NOTICE_COOKIE, expiryReason ?? "", {
    ...(expiryReason ? { maxAge: 10 * 60 } : { expires: new Date(0) }),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.set(AUTH_PROMPT_COOKIE, prompt, {
    maxAge: 10 * 60,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

function requestedPrompt(request: Request) {
  return new URL(request.url).searchParams.get("mode") === "switch"
    ? ("select_account" as const)
    : ("login" as const);
}

function requestedExpiryReason(request: Request) {
  return parseSessionExpiryReason(
    new URL(request.url).searchParams.get("reason"),
  );
}

export async function GET(request: Request) {
  return performLogout(
    requestedPrompt(request),
    requestedExpiryReason(request),
  );
}

export async function POST(request: Request) {
  return performLogout(
    requestedPrompt(request),
    requestedExpiryReason(request),
  );
}
