import { NextResponse } from "next/server";
import { normalizeAuthReturnTo } from "@/lib/auth-return";
import { refreshKeystoneSession } from "@/lib/keystone/renewal";
import { getSession } from "@/lib/session";

const SUNRISE_DASHBOARD_URL =
  process.env.SUNRISE_DASHBOARD_URL ?? "http://localhost";

function loginUrl(identityProvider: string, returnTo: string) {
  const url = new URL("/auth/oidc/login", SUNRISE_DASHBOARD_URL);
  url.searchParams.set("idp", identityProvider);
  url.searchParams.set("returnTo", returnTo);
  url.searchParams.set("continuation", "1");
  return url;
}

export async function GET(request: Request) {
  const returnTo = normalizeAuthReturnTo(
    new URL(request.url).searchParams.get("returnTo"),
  );
  const session = await getSession();
  if (session.sessionExpiryReason) {
    return NextResponse.redirect(new URL("/", SUNRISE_DASHBOARD_URL), {
      status: 303,
    });
  }
  const identityProvider =
    session.federationIdentityProvider ??
    session.oidcIdentity?.identityProvider;

  try {
    const result = await refreshKeystoneSession(session);
    if (result === "ready") {
      return NextResponse.redirect(new URL(returnTo, SUNRISE_DASHBOARD_URL), {
        status: 303,
      });
    }
    if (result === "no-projects" || result === "no-role") {
      return NextResponse.redirect(new URL("/", SUNRISE_DASHBOARD_URL), {
        status: 303,
      });
    }
    if (result === "expired") {
      return NextResponse.redirect(new URL("/", SUNRISE_DASHBOARD_URL), {
        status: 303,
      });
    }
    if (identityProvider) {
      return NextResponse.redirect(loginUrl(identityProvider, returnTo), {
        status: 303,
      });
    }
  } catch (error) {
    console.warn("[keystone/session] automatic renewal failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    session.authRecovery = { reason: "session-unavailable" };
    await session.save();
    return NextResponse.redirect(new URL("/", SUNRISE_DASHBOARD_URL), {
      status: 303,
    });
  }

  return NextResponse.redirect(
    new URL("/auth/logout?reason=expired&mode=switch", SUNRISE_DASHBOARD_URL),
    { status: 303 },
  );
}
