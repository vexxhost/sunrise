import {
  getSession,
  prepareSessionLifetime,
  saveSessionActivity,
} from "@/lib/session";
import {
  finalizeKeystoneSession,
  KeystoneSessionSetupError,
} from "@/lib/keystone/login";
import {
  isStoredSessionSupersededError,
  StoredSessionSupersededError,
} from "@/lib/session-errors";
import { saveRedisSession } from "@/lib/session-store";

const SUNRISE_DASHBOARD_URL = process.env.SUNRISE_DASHBOARD_URL ?? "/";

type WebSsoSession = Awaited<ReturnType<typeof getSession>>;

async function saveWebSsoResult(session: WebSsoSession) {
  try {
    await saveRedisSession(session, {
      // Rotation gives this callback an empty successor. Any record created
      // there before a terminal save belongs to a newer request, so neither
      // authentication fields nor invalid-response cleanup may merge into it.
      validateConflictRetry: () => {
        throw new StoredSessionSupersededError(
          "WebSSO result was superseded by a newer session update",
        );
      },
    });
    return true;
  } catch (error) {
    if (isStoredSessionSupersededError(error)) return false;
    throw error;
  }
}

/**
 * Legacy Keystone WebSSO POST callback. Kept as a fallback for setups still
 * driving login through Keystone's federation endpoint. The unified Sunrise
 * OIDC flow at `/auth/oidc/login` is the preferred path.
 */
export async function POST(request: Request) {
  const session = await getSession();
  const formData = await request.formData();
  const token = formData.get("token");

  if (typeof token !== "string" || token.length === 0) {
    console.error("Missing token in WebSSO response");
    session.keystone_unscoped_token = undefined;
    session.keystoneProjectToken = undefined;
    session.keystoneProjectRoles = undefined;
    session.projectId = undefined;
    session.regionId = undefined;
    if (!(await saveWebSsoResult(session))) {
      return Response.redirect(SUNRISE_DASHBOARD_URL, 303);
    }
    return new Response("Invalid WebSSO response", { status: 400 });
  }

  let pendingActivity: { sessionId: string; lastActivityAt: number };
  try {
    pendingActivity = await prepareSessionLifetime(session);
  } catch (error) {
    if (isStoredSessionSupersededError(error)) {
      return Response.redirect(SUNRISE_DASHBOARD_URL, 303);
    }
    throw error;
  }

  try {
    const resolution = await finalizeKeystoneSession(session, token);
    session.authRecovery =
      resolution.status === "ready" ? undefined : { reason: resolution.status };
  } catch (error) {
    session.authRecovery = {
      reason:
        error instanceof KeystoneSessionSetupError
          ? error.reason
          : "session-unavailable",
    };
    console.error(
      "[auth/websso] Keystone session finalize failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
  if (!(await saveWebSsoResult(session))) {
    return Response.redirect(SUNRISE_DASHBOARD_URL, 303);
  }
  await saveSessionActivity(
    pendingActivity.sessionId,
    pendingActivity.lastActivityAt,
  );

  return Response.redirect(SUNRISE_DASHBOARD_URL, 303);
}
