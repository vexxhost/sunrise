import { NextResponse } from "next/server";
import { AUTH_PROMPT_COOKIE } from "@/lib/auth-prompt";
import {
  buildEndSessionUrl,
  refreshAccessToken,
  type OidcAuthorizationPrompt,
} from "@/lib/oidc/sunrise";
import { getSession } from "@/lib/session";

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
    process.env.DASHBOARD_URL || "http://localhost",
  ).toString();
}

async function logoutIdToken(refreshToken?: string) {
  if (!refreshToken) return undefined;

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    return refreshed.id_token;
  } catch (error) {
    console.warn("Unable to refresh the OIDC ID token for logout:", error);
    return undefined;
  }
}

async function providerLogoutUrl(idTokenHint?: string) {
  try {
    return await buildEndSessionUrl({
      postLogoutRedirectUri: dashboardUrl(),
      idTokenHint,
    });
  } catch (error) {
    console.warn("Unable to discover the OIDC logout endpoint:", error);
    return null;
  }
}

async function performLogout(prompt: OidcAuthorizationPrompt) {
  const session = await getSession();
  const unscoped = session.keystone_unscoped_token;
  const scoped = session.keystoneProjectToken;
  const refreshToken = session.keycloakRefreshToken;

  // Resolve the provider logout hint while revoking both Keystone tokens.
  const [idTokenHint] = await Promise.all([
    logoutIdToken(refreshToken),
    scoped && unscoped ? revokeToken(scoped, unscoped) : Promise.resolve(),
    unscoped ? revokeToken(unscoped, unscoped) : Promise.resolve(),
  ]);
  const endSessionUrl = await providerLogoutUrl(idTokenHint);

  session.destroy();

  const response = NextResponse.redirect(endSessionUrl ?? dashboardUrl(), {
    status: 303,
  });
  // Defensively clear the session cookie on the redirect response itself,
  // in case iron-session's destroy() doesn't propagate through the redirect.
  response.cookies.set("sunrise", "", {
    expires: new Date(0),
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

export async function GET(request: Request) {
  return performLogout(requestedPrompt(request));
}

export async function POST(request: Request) {
  return performLogout(requestedPrompt(request));
}
