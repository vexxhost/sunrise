import "server-only";

import { NextResponse } from "next/server";
import { getS3Endpoint } from "@/lib/s3/endpoint";

export async function unavailableS3RouteResponse(request: Request) {
  try {
    await getS3Endpoint();
    return null;
  } catch {
    return NextResponse.redirect(new URL("/object-storage", request.url), 303);
  }
}
