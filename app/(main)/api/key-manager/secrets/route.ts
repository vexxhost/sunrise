import { NextRequest, NextResponse } from "next/server";

import { isSameOriginRequest } from "@/lib/request-origin";
import { createBarbicanSecret } from "@/lib/openstack/barbican-secret-mutation";
import type { MutationScope } from "@/lib/mutations";
import { unavailableServiceRouteResponse } from "@/lib/service-route-guard";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const candidate = body as { scope?: MutationScope; input?: unknown };
  if (!candidate.scope) {
    return NextResponse.json(
      { error: "Missing project context" },
      { status: 400 },
    );
  }

  const unavailable = unavailableServiceRouteResponse(
    "key-manager",
    candidate.scope.regionId,
  );
  if (unavailable) return unavailable;

  const result = await createBarbicanSecret(candidate.scope, candidate.input);
  return NextResponse.json(result, { status: result.ok ? 201 : 400 });
}
