import { NextResponse } from "next/server";
import { normalizeAuthReturnTo } from "@/lib/auth-return";
import { clearS3Credentials, getSession } from "@/lib/session";
import { refreshActiveProjectS3Credentials } from "@/lib/s3/session";
import { getS3Endpoint } from "@/lib/s3/endpoint";
import {
  captureOidcSessionAuthority,
  isOidcSessionSupersededError,
  saveOidcSessionIfAuthoritative,
} from "@/lib/oidc/session-authority";

const SUNRISE_DASHBOARD_URL =
  process.env.SUNRISE_DASHBOARD_URL ?? "http://localhost";

function objectStorageUnavailableUrl(returnTo: string): URL {
  const url = new URL(
    "/object-storage/auth/unavailable",
    SUNRISE_DASHBOARD_URL,
  );
  url.searchParams.set("returnTo", returnTo);
  return url;
}

async function clearS3CredentialsIfAuthoritative(
  session: Awaited<ReturnType<typeof getSession>>,
) {
  const authority = captureOidcSessionAuthority(session);
  clearS3Credentials(session);
  try {
    await saveOidcSessionIfAuthoritative(session, authority);
  } catch (error) {
    if (!isOidcSessionSupersededError(error)) throw error;
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = normalizeAuthReturnTo(
    requestUrl.searchParams.get("returnTo"),
  );
  const session = await getSession();
  if (session.sessionExpiryReason) {
    return NextResponse.redirect(new URL("/", SUNRISE_DASHBOARD_URL), {
      status: 303,
    });
  }
  try {
    await getS3Endpoint();
  } catch {
    await clearS3CredentialsIfAuthoritative(session);
    return NextResponse.redirect(
      new URL("/object-storage", SUNRISE_DASHBOARD_URL),
      {
        status: 303,
      },
    );
  }

  try {
    const credentials = await refreshActiveProjectS3Credentials(session);
    if (credentials) {
      return NextResponse.redirect(new URL(returnTo, SUNRISE_DASHBOARD_URL), {
        status: 303,
      });
    }
  } catch (error) {
    console.warn("[s3/auth] automatic credential refresh failed", {
      projectId: session.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!isOidcSessionSupersededError(error)) {
      await clearS3CredentialsIfAuthoritative(session);
    }
    return NextResponse.redirect(objectStorageUnavailableUrl(returnTo), {
      status: 303,
    });
  }

  await clearS3CredentialsIfAuthoritative(session);
  return NextResponse.redirect(objectStorageUnavailableUrl(returnTo), {
    status: 303,
  });
}
