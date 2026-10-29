import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createSunriseRequestId,
  SUNRISE_REQUEST_ID_HEADER,
} from "@/lib/request-correlation";

export function proxy(request: NextRequest) {
  const requestId = createSunriseRequestId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(SUNRISE_REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(SUNRISE_REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
  ],
};
