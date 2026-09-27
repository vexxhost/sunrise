import { NextRequest, NextResponse } from "next/server";
import { readPrefs, writePrefs } from "@/lib/prefs";
import {
  removeResourcePreference,
  type ResourcePreference,
} from "@/lib/resource-preferences";
import {
  isRecoveryResourceKind,
  recoveryDestination,
  recoveryPreferenceKind,
} from "@/lib/resource-recovery";
import { getSession } from "@/lib/session";

// S3 object keys can contain up to 1,024 characters. Other resource IDs are
// much shorter, but using one bound keeps this internal endpoint predictable.
const MAX_RESOURCE_ID_LENGTH = 1024;

function validIdentifier(value: string | null) {
  if (!value) return undefined;
  return value.trim() && value.length <= MAX_RESOURCE_ID_LENGTH
    ? value
    : undefined;
}

export async function GET(request: NextRequest) {
  const kindValue = request.nextUrl.searchParams.get("kind");
  const id = validIdentifier(request.nextUrl.searchParams.get("id"));
  const parentId = validIdentifier(
    request.nextUrl.searchParams.get("parentId"),
  );
  const mode =
    request.nextUrl.searchParams.get("mode") === "direct"
      ? ("direct" as const)
      : undefined;

  if (!isRecoveryResourceKind(kindValue) || !id) {
    return NextResponse.json(
      { error: "Invalid resource recovery request" },
      { status: 400 },
    );
  }

  const destination = recoveryDestination({ kind: kindValue, parentId, mode });
  const session = await getSession();
  const preferenceKind = recoveryPreferenceKind(kindValue);

  if (preferenceKind && session.projectId && session.regionId) {
    const prefs = await readPrefs();
    const target: Pick<
      ResourcePreference,
      "kind" | "id" | "projectId" | "regionId"
    > = {
      kind: preferenceKind,
      id,
      projectId: session.projectId,
      regionId: session.regionId,
    };
    const recentResources = removeResourcePreference(
      prefs.recentResources ?? [],
      target,
    );
    const pinnedResources = removeResourcePreference(
      prefs.pinnedResources ?? [],
      target,
    );

    if (
      recentResources.length !== (prefs.recentResources ?? []).length ||
      pinnedResources.length !== (prefs.pinnedResources ?? []).length
    ) {
      await writePrefs({ recentResources, pinnedResources });
    }
  }

  const redirectUrl = new URL(destination, request.url);
  redirectUrl.searchParams.set("notice", "resource-unavailable");
  redirectUrl.searchParams.set("kind", kindValue);
  return NextResponse.redirect(redirectUrl);
}
