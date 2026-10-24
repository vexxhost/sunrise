import "server-only";

import { NextResponse } from "next/server";
import { getS3Endpoint } from "@/lib/s3/endpoint";
import { getRequestRedirectOrigin } from "@/lib/request-origin";

export async function unavailableS3RouteResponse(request: Request) {
  try {
    await getS3Endpoint();
    return null;
  } catch {
    return NextResponse.redirect(
      new URL(
        "/object-storage",
        getRequestRedirectOrigin(
          request,
          process.env.SUNRISE_DASHBOARD_URL,
          process.env.SUNRISE_ALLOWED_DASHBOARD_ORIGINS,
        ),
      ),
      303,
    );
  }
}
