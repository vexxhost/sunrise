import { NextResponse } from "next/server";
import {
  getSessionLifetimeState,
  type ClientSessionLifetime,
} from "@/lib/session-lifetime";
import {
  getSession,
  hasAuthenticatedSession,
  saveSessionActivity,
} from "@/lib/session";

export const dynamic = "force-dynamic";

async function sessionActivity(touch: boolean) {
  const session = await getSession({ allowExpired: true });
  if (!session.sessionId || !hasAuthenticatedSession(session)) {
    return NextResponse.json(
      { status: "missing" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const now = Date.now();
  const current = getSessionLifetimeState(session, now);
  if (current.status !== "active") {
    return NextResponse.json(
      { status: "expired", reason: current.reason },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (touch) await saveSessionActivity(session.sessionId, now);
  const lastActivityAt = touch ? now : current.lastActivityAt;
  const updated = getSessionLifetimeState(
    {
      sessionSignedInAt: session.sessionSignedInAt,
      sessionLastActivityAt: lastActivityAt,
    },
    now,
  );

  if (updated.status !== "active") {
    return NextResponse.json(
      { status: "expired", reason: updated.reason },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ...updated,
      sessionId: session.sessionId,
    } satisfies ClientSessionLifetime,
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  return sessionActivity(false);
}

export async function POST() {
  return sessionActivity(true);
}
