import { getSession, startSessionLifetime } from "@/lib/session";
import {
  finalizeKeystoneSession,
  KeystoneSessionSetupError,
} from "@/lib/keystone/login";
import { isStoredSessionSupersededError } from "@/lib/session-errors";

const SUNRISE_DASHBOARD_URL = process.env.SUNRISE_DASHBOARD_URL ?? "/";

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
    await session.save();
    return new Response("Invalid WebSSO response", { status: 400 });
  }

  try {
    await startSessionLifetime(session);
    const resolution = await finalizeKeystoneSession(session, token);
    session.authRecovery =
      resolution.status === "ready" ? undefined : { reason: resolution.status };
  } catch (error) {
    if (isStoredSessionSupersededError(error)) {
      return Response.redirect(SUNRISE_DASHBOARD_URL, 303);
    }
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
  try {
    await session.save();
  } catch (error) {
    if (isStoredSessionSupersededError(error)) {
      return Response.redirect(SUNRISE_DASHBOARD_URL, 303);
    }
    throw error;
  }

  return Response.redirect(SUNRISE_DASHBOARD_URL, 303);
}
