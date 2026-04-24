import { NextResponse } from "next/server";
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

async function performLogout() {
  const session = await getSession();
  const unscoped = session.keystone_unscoped_token;
  const scoped = session.keystoneProjectToken;

  // Revoke at Keystone before destroying the local session.
  await Promise.all([
    scoped && unscoped ? revokeToken(scoped, unscoped) : Promise.resolve(),
    unscoped ? revokeToken(unscoped, unscoped) : Promise.resolve(),
  ]);

  session.destroy();

  const response = NextResponse.redirect(
    process.env.DASHBOARD_URL || "/",
    { status: 303 }
  );
  // Defensively clear the session cookie on the redirect response itself,
  // in case iron-session's destroy() doesn't propagate through the redirect.
  response.cookies.set("sunrise", "", {
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  return response;
}

export async function GET() {
  return performLogout();
}

export async function POST() {
  return performLogout();
}
