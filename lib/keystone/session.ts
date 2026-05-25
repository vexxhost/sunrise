import "server-only";
import type { IronSession } from "iron-session";
import { getProjectScopedToken } from "@/lib/keystone/login";
import type { SunriseSession } from "@/lib/session";

const KEYSTONE_API = process.env.KEYSTONE_API;

export type KeystoneSessionState =
  | { status: "missing" }
  | { status: "valid" }
  | { status: "invalid"; reason: string }
  | { status: "unknown"; reason: string };

export function isKeystoneAuthFailure(status: number) {
  return status === 401;
}

function isKeystoneTokenValidationFailure(status: number) {
  return status === 401 || status === 404;
}

async function validateToken(token: string, subjectToken = token) {
  if (!KEYSTONE_API) {
    return {
      status: "unknown" as const,
      reason: "KEYSTONE_API is not configured",
    };
  }

  try {
    const response = await fetch(`${KEYSTONE_API}/v3/auth/tokens`, {
      method: "GET",
      headers: {
        "X-Auth-Token": token,
        "X-Subject-Token": subjectToken,
      },
      cache: "no-store",
    });

    if (response.ok) {
      return { status: "valid" as const };
    }

    if (isKeystoneTokenValidationFailure(response.status)) {
      return {
        status: "invalid" as const,
        reason: `Keystone token validation failed with ${response.status}`,
      };
    }

    return {
      status: "unknown" as const,
      reason: `Keystone token validation returned ${response.status}`,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "unknown Keystone error";
    return { status: "unknown" as const, reason };
  }
}

export async function getKeystoneSessionState(
  session: IronSession<SunriseSession>,
): Promise<KeystoneSessionState> {
  if (!session.keystone_unscoped_token) {
    return { status: "missing" };
  }

  const unscoped = await validateToken(session.keystone_unscoped_token);
  if (unscoped.status !== "valid") {
    return unscoped;
  }

  if (session.projectId && !session.keystoneProjectToken) {
    const token = await getProjectScopedToken(
      session.keystone_unscoped_token,
      session.projectId,
    );

    if (token) {
      session.keystoneProjectToken = token;
      await session.save();
    } else {
      return {
        status: "unknown",
        reason: "Session has a project selection but no project-scoped token",
      };
    }
  }

  if (!session.projectId && session.keystoneProjectToken) {
    session.keystoneProjectToken = undefined;
    await session.save();
  }

  if (session.keystoneProjectToken) {
    const scoped = await validateToken(session.keystoneProjectToken);
    if (scoped.status !== "valid") {
      return scoped;
    }
  }

  return { status: "valid" };
}
