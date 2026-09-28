import { NextRequest, NextResponse } from "next/server";
import {
  isRecoveryResourceKind,
  recoveryDestination,
  recoveryPreferenceKind,
  type ResourceRecoveryTarget,
} from "@/lib/resource-recovery";
import { verifyResourceRecoveryProof } from "@/lib/resource-recovery-proof";
import { removeSavedResourcePreferences } from "@/lib/resource-preference-store";
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
  const preferenceKind = recoveryPreferenceKind(kindValue);

  if (preferenceKind) {
    const session = await getSession();
    const recoveryAt = Number(
      request.nextUrl.searchParams.get("recoveryAt") ?? Number.NaN,
    );
    const recoveryProof = request.nextUrl.searchParams.get("recoveryProof");
    const target: ResourceRecoveryTarget = {
      kind: kindValue,
      id,
      parentId,
      mode,
    };
    if (
      session.projectId &&
      session.regionId &&
      recoveryProof &&
      verifyResourceRecoveryProof(
        target,
        { projectId: session.projectId, regionId: session.regionId },
        { issuedAt: recoveryAt, signature: recoveryProof },
      )
    ) {
      try {
        await removeSavedResourcePreferences(
          [{ kind: preferenceKind, id }],
          { projectId: session.projectId, regionId: session.regionId },
        );
      } catch (error) {
        console.warn("[preferences] missing resource cleanup failed", {
          error,
          id,
          kind: preferenceKind,
        });
      }
    }
  }

  const redirectUrl = new URL(destination, request.url);
  redirectUrl.searchParams.set("notice", "resource-unavailable");
  redirectUrl.searchParams.set("kind", kindValue);
  return NextResponse.redirect(redirectUrl);
}
