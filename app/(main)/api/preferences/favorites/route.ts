import { NextRequest, NextResponse } from "next/server";
import {
  isNavigationDestinationId,
  parseFavoriteDestinationIds,
  toggleFavoriteDestination,
} from "@/lib/navigation-destinations";
import { readPrefs, writePrefs } from "@/lib/prefs";
import { isSameOriginRequest } from "@/lib/request-origin";
import { getSession } from "@/lib/session";
import { preferenceIdentityFromSession } from "@/lib/preference-identity";

export async function POST(request: NextRequest) {
  if (
    !request.headers.get("origin") ||
    !isSameOriginRequest(request.headers, request.nextUrl.origin)
  ) {
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  }

  const session = await getSession();
  if (!session.keystoneProjectToken) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const preferenceIdentity = preferenceIdentityFromSession(session);
  if (!preferenceIdentity) {
    return NextResponse.json(
      { error: "Authenticated identity required" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const destinationId =
    body && typeof body === "object" && "destinationId" in body
      ? body.destinationId
      : undefined;
  if (!isNavigationDestinationId(destinationId)) {
    return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
  }

  const prefs = await readPrefs(preferenceIdentity);
  const favoriteDestinations = toggleFavoriteDestination(
    parseFavoriteDestinationIds(prefs.favoriteDestinations),
    destinationId,
  );
  await writePrefs({ favoriteDestinations }, preferenceIdentity);

  return NextResponse.json({ favoriteDestinations });
}
