import { NextResponse } from "next/server";
import { normalizeAuthReturnTo } from "@/lib/auth-return";
import { clearS3Credentials, getSession } from "@/lib/session";
import { refreshActiveProjectS3Credentials } from "@/lib/s3/session";

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost";

function objectStorageUnavailableUrl(returnTo: string): URL {
  const url = new URL("/object-storage/auth/unavailable", DASHBOARD_URL);
  url.searchParams.set("returnTo", returnTo);
  return url;
}

function objectStorageLoginUrl(returnTo: string): URL {
  const url = new URL("/object-storage/auth/login", DASHBOARD_URL);
  url.searchParams.set("returnTo", returnTo);
  return url;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = normalizeAuthReturnTo(
    requestUrl.searchParams.get("returnTo"),
  );
  const session = await getSession();

  try {
    const credentials = await refreshActiveProjectS3Credentials(session);
    if (credentials) {
      return NextResponse.redirect(new URL(returnTo, DASHBOARD_URL), {
        status: 303,
      });
    }
  } catch (error) {
    console.warn("[s3/auth] automatic credential refresh failed", {
      projectId: session.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    clearS3Credentials(session);
    await session.save();
    return NextResponse.redirect(objectStorageUnavailableUrl(returnTo), {
      status: 303,
    });
  }

  clearS3Credentials(session);
  await session.save();
  return NextResponse.redirect(objectStorageLoginUrl(returnTo), {
    status: 303,
  });
}
