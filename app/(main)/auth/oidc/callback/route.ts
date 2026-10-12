import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeAuthReturnTo } from "@/lib/auth-return";
import { stashCloudContextBootstrap } from "@/lib/cloud-context-bootstrap";
import {
  getSession,
  normalizeProjectId,
  prepareSessionLifetime,
  saveSessionActivity,
  setS3CredentialsForProject,
} from "@/lib/session";
import {
  getSessionLifetimeState,
  SESSION_EXPIRY_NOTICE_COOKIE,
} from "@/lib/session-lifetime";
import {
  exchangeCodeForTokens,
  getSunriseOidcConfig,
  resolveOidcIdentity,
} from "@/lib/oidc/sunrise";
import { getServicePolicy } from "@/lib/deployment-config";
import {
  federateOidcWithKeystone,
  finalizeKeystoneSession,
  KeystoneSessionSetupError,
  type KeystoneSessionResolution,
} from "@/lib/keystone/login";
import { getS3Endpoint } from "@/lib/s3/endpoint";
import { assumeRoleWithIdToken, tryExtractRgwProjectRoles } from "@/lib/s3/sts";
import { resolveObjectStorageBackend } from "@/lib/object-storage/backend";
import {
  isSunriseServiceEnabled,
  type ServicePolicy,
} from "@/lib/service-policy";
import { saveRedisSession } from "@/lib/session-store";
import { isStoredSessionSupersededError } from "@/lib/session-errors";
import {
  isOidcSessionSupersededError,
  OidcSessionSupersededError,
} from "@/lib/oidc/session-authority";

const SUNRISE_DASHBOARD_URL = process.env.SUNRISE_DASHBOARD_URL ?? "/";

type OidcCallbackSession = Awaited<ReturnType<typeof getSession>>;

async function saveOidcFlow(
  session: OidcCallbackSession,
  expectedFlowId: string,
) {
  try {
    await saveRedisSession(session, {
      validateConflictRetry: (authoritative) => {
        if (authoritative.oidcFlowId !== expectedFlowId) {
          throw new OidcSessionSupersededError(
            "OIDC callback was superseded by a newer authorization flow",
          );
        }
      },
    });
    return true;
  } catch (error) {
    if (
      isOidcSessionSupersededError(error) ||
      isStoredSessionSupersededError(error)
    ) {
      return false;
    }
    throw error;
  }
}

async function finishOidcFlow(
  session: OidcCallbackSession,
  expectedFlowId: string,
  activity?: { sessionId: string; lastActivityAt: number },
) {
  session.oidcFlowId = undefined;
  session.oidcSessionContinuation = undefined;
  if (!(await saveOidcFlow(session, expectedFlowId))) return false;
  if (activity) {
    await saveSessionActivity(activity.sessionId, activity.lastActivityAt);
  }
  return true;
}

function supersededFlowResponse() {
  return NextResponse.redirect(SUNRISE_DASHBOARD_URL, { status: 303 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const session = await getSession({ allowExpired: true });
  const expectedState = session.oidcState;
  const verifier = session.oidcVerifier;
  const idp = session.oidcIdProvider;
  const flowId = session.oidcFlowId;
  const returnTo = normalizeAuthReturnTo(session.oidcReturnTo);
  const continuation = session.oidcSessionContinuation === true;

  // A callback that does not match the current authorization state belongs to
  // an older or invalid flow and must not consume the current one.
  if (!flowId || !state || !expectedState) {
    return new NextResponse("Missing OIDC parameters", { status: 400 });
  }
  if (state !== expectedState) {
    return new NextResponse("OIDC state mismatch", { status: 400 });
  }

  // Single-use values; the continuation marker remains authoritative until
  // the callback reaches a terminal save so background refresh stays paused.
  session.oidcState = undefined;
  session.oidcVerifier = undefined;
  session.oidcReturnTo = undefined;
  session.oidcIdProvider = undefined;

  if (errorParam) {
    if (!(await finishOidcFlow(session, flowId))) {
      return supersededFlowResponse();
    }
    return new NextResponse(`OIDC error: ${errorParam}`, { status: 400 });
  }
  if (!code || !verifier || !idp) {
    if (!(await finishOidcFlow(session, flowId))) {
      return supersededFlowResponse();
    }
    return new NextResponse("Missing OIDC parameters", { status: 400 });
  }

  // Exchange the login flow for a callback-specific owner before doing any
  // remote work. This admits only one callback and lets a newer login revoke
  // the callback's authority while Keystone or STS calls are in flight.
  const callbackFlowId = randomUUID();
  session.oidcFlowId = callbackFlowId;
  if (!(await saveOidcFlow(session, flowId))) {
    return supersededFlowResponse();
  }

  if (continuation) {
    const lifetime = getSessionLifetimeState(session);
    if (lifetime.status !== "active" || !session.sessionId) {
      if (!(await finishOidcFlow(session, callbackFlowId))) {
        return supersededFlowResponse();
      }
      return NextResponse.redirect(SUNRISE_DASHBOARD_URL, { status: 303 });
    }
  }

  let servicePolicy: ServicePolicy;
  let oidcConfig: ReturnType<typeof getSunriseOidcConfig>;
  try {
    servicePolicy = getServicePolicy();
    oidcConfig = getSunriseOidcConfig(idp);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid service policy";
    console.error("[oidc/callback] invalid service policy:", message);
    if (!(await finishOidcFlow(session, callbackFlowId))) {
      return supersededFlowResponse();
    }
    return new NextResponse(`Sunrise configuration error: ${message}`, {
      status: 500,
    });
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, verifier, idp);
  } catch (e) {
    if (!(await finishOidcFlow(session, callbackFlowId))) {
      return supersededFlowResponse();
    }
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[oidc/callback] code exchange failed:", msg);
    return new NextResponse(`Login failed: ${msg}`, { status: 500 });
  }

  let pendingActivity: { sessionId: string; lastActivityAt: number };
  try {
    if (continuation && session.sessionId) {
      pendingActivity = {
        sessionId: session.sessionId,
        lastActivityAt: Date.now(),
      };
    } else {
      pendingActivity = await prepareSessionLifetime(session);
    }
  } catch (error) {
    if (isStoredSessionSupersededError(error)) {
      return supersededFlowResponse();
    }
    throw error;
  }

  session.keycloakRefreshToken = tokens.refresh_token;
  session.oidcRefreshCheckpoint = undefined;
  session.oidcSessionGeneration = randomUUID();
  session.federationIdentityProvider = idp;
  const identityPromise = resolveOidcIdentity(
    tokens.access_token,
    tokens.id_token,
    idp,
  );
  session.oidcIdentity = undefined;
  session.authRecovery = undefined;
  session.keystone_unscoped_token = undefined;
  session.keystoneProjectToken = undefined;
  session.keystoneProjectRoles = undefined;
  session.projectId = undefined;
  session.s3ProjectRoles = undefined;
  session.s3Credentials = undefined;
  session.cloudContextBootstrapId = undefined;

  // 1. Federate into Keystone.
  let unscopedToken: string;
  try {
    const [identityResult, federationResult] = await Promise.allSettled([
      identityPromise,
      federateOidcWithKeystone(tokens.access_token, idp, oidcConfig.protocol),
    ]);
    if (identityResult.status === "fulfilled") {
      session.oidcIdentity = identityResult.value ?? undefined;
    }
    if (federationResult.status === "rejected") {
      throw federationResult.reason;
    }
    unscopedToken = federationResult.value;
  } catch (e) {
    session.authRecovery = { reason: "federation-failed" };
    if (!(await finishOidcFlow(session, callbackFlowId, pendingActivity))) {
      return supersededFlowResponse();
    }
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[oidc/callback] Keystone federation failed:", msg);
    return NextResponse.redirect(SUNRISE_DASHBOARD_URL, { status: 303 });
  }

  let resolution: KeystoneSessionResolution;
  try {
    resolution = await finalizeKeystoneSession(session, unscopedToken);
    if (resolution.status !== "ready") {
      session.authRecovery = { reason: resolution.status };
    }
  } catch (e) {
    session.authRecovery = {
      reason:
        e instanceof KeystoneSessionSetupError
          ? e.reason
          : "session-unavailable",
    };
    if (!(await finishOidcFlow(session, callbackFlowId, pendingActivity))) {
      return supersededFlowResponse();
    }
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[oidc/callback] Keystone session finalize failed:", msg);
    return NextResponse.redirect(SUNRISE_DASHBOARD_URL, { status: 303 });
  }

  if (resolution.status !== "ready") {
    if (!(await finishOidcFlow(session, callbackFlowId, pendingActivity))) {
      return supersededFlowResponse();
    }
    return NextResponse.redirect(SUNRISE_DASHBOARD_URL, { status: 303 });
  }

  session.authRecovery = undefined;
  session.cloudContextBootstrapId = stashCloudContextBootstrap({
    projects: resolution.projects,
    regions: resolution.regions,
    catalog: resolution.catalog,
    userName:
      session.oidcIdentity?.preferredUsername ??
      resolution.userName ??
      session.oidcIdentity?.displayName ??
      undefined,
  });

  // 2. STS only when S3 is selected for this region. The primary Sunrise
  // access token is also the RGW web-identity token.
  const objectStorage =
    resolution.catalog &&
    session.regionId &&
    isSunriseServiceEnabled(servicePolicy, "object-storage", session.regionId)
      ? resolveObjectStorageBackend(
          resolution.catalog,
          session.regionId,
          servicePolicy,
        )
      : null;
  if (objectStorage?.backend === "s3") {
    try {
      const projectRoles = tryExtractRgwProjectRoles(
        tokens.access_token,
        tokens.id_token,
      );
      if (!projectRoles) {
        throw new Error("RGW project roles claim is missing from token");
      }
      const projectId = normalizeProjectId(session.projectId);
      const roleArn = projectRoles[projectId];
      if (!roleArn) {
        throw new Error(
          `No RGW role ARN found for active project ${projectId}`,
        );
      }

      session.s3ProjectRoles = projectRoles;
      if (!session.regionId || !session.keystoneProjectToken) {
        throw new Error("Keystone project context is incomplete");
      }
      const endpoint = await getS3Endpoint({
        regionId: session.regionId,
        token: session.keystoneProjectToken,
        catalog: resolution.catalog,
      });
      const creds = await assumeRoleWithIdToken(
        tokens.access_token,
        projectId,
        roleArn,
        endpoint,
        oidcConfig.rgwStsDurationSeconds,
      );
      setS3CredentialsForProject(session, creds);
    } catch (e) {
      // Non-fatal: user can still use other services. Object Storage will try
      // one server-side credential refresh before showing its recovery state.
      const msg = e instanceof Error ? e.message : "unknown error";
      console.error("[oidc/callback] STS setup failed (non-fatal):", msg);
    }
  }

  if (!(await finishOidcFlow(session, callbackFlowId, pendingActivity))) {
    return supersededFlowResponse();
  }
  const response = NextResponse.redirect(
    new URL(returnTo, SUNRISE_DASHBOARD_URL),
    {
      status: 303,
    },
  );
  response.cookies.set(SESSION_EXPIRY_NOTICE_COOKIE, "", {
    expires: new Date(0),
    path: "/",
  });
  return response;
}
