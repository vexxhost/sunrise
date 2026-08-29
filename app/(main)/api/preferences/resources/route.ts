import { NextRequest, NextResponse } from "next/server";
import { readPrefs, writePrefs } from "@/lib/prefs";
import {
  addRecentResource,
  createResourcePreference,
  togglePinnedResource,
  visibleResourcePreferences,
} from "@/lib/resource-preferences";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const session = await getSession();
  if (
    !session.keystoneProjectToken ||
    !session.projectId ||
    !session.regionId
  ) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { operation, resource: input } = body as {
    operation?: unknown;
    resource?: unknown;
  };
  if (operation !== "recent" && operation !== "toggle-pin") {
    return NextResponse.json({ error: "Invalid operation" }, { status: 400 });
  }

  const context = {
    projectId: session.projectId,
    regionId: session.regionId,
  };
  const resource = createResourcePreference(input, context);
  if (!resource) {
    return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  }

  const prefs = await readPrefs();
  const recent = prefs.recentResources ?? [];
  const pinned = prefs.pinnedResources ?? [];

  if (operation === "recent") {
    const nextRecent = addRecentResource(recent, resource);
    await writePrefs({ recentResources: nextRecent });
    return new Response(null, { status: 204 });
  }

  const nextPinned = togglePinnedResource(pinned, resource).resources;
  await writePrefs({ pinnedResources: nextPinned });

  return NextResponse.json(
    visibleResourcePreferences({
      recent,
      pinned: nextPinned,
      context,
    }),
  );
}
