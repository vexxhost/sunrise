import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeAuthReturnTo } from "@/lib/auth-return";
import { stashCloudContextBootstrap } from "@/lib/cloud-context-bootstrap";
import {
  getSession,
  normalizeProjectId,
  saveSessionActivity,
  setS3CredentialsForProject,
  startSessionLifetime,
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

const SUNRISE_DASHBOARD_URL = process.env.SUNRISE_DASHBOARD_URL ?? "/";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const session = await getSession({ allowExpired: true });
  const expectedState = session.oidcState;
  const verifier = session.oidcVerifier;
  const idp = session.oidcIdProvider;
  const returnTo = normalizeAuthReturnTo(session.oidcReturnTo);
  const continuation = session.oidcSessionContinuation === true;

  // Single-use values; clear regardless of outcome.
  session.oidcState = undefined;
  session.oidcVerifier = undefined;
  session.oidcReturnTo = undefined;
  session.oidcIdProvider = undefined;
  session.oidcSessionContinuation = undefined;

  if (errorParam) {
    await session.save();
    return new NextResponse(`OIDC error: ${errorParam}`, { status: 400 });
  }
  if (!code || !state || !verifier || !idp) {
    await session.save();
    return new NextResponse("Missing OIDC parameters", { status: 400 });
  }
  if (state !== expectedState) {
    await session.save();
    return new NextResponse("OIDC state mismatch", { status: 400 });
  }

  if (continuation) {
    const lifetime = getSessionLifetimeState(session);
    if (lifetime.status !== "active" || !session.sessionId) {
      await session.save();
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
    return new NextResponse(`Sunrise configuration error: ${message}`, {
      status: 500,
    });
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, verifier, idp);
  } catch (e) {
    await session.save();
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[oidc/callback] code exchange failed:", msg);
    return new NextResponse(`Login failed: ${msg}`, { status: 500 });
  }

  if (continuation && session.sessionId) {
    await saveSessionActivity(session.sessionId);
  } else {
    await startSessionLifetime(session);
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
    await session.save();
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
    await session.save();
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[oidc/callback] Keystone session finalize failed:", msg);
    return NextResponse.redirect(SUNRISE_DASHBOARD_URL, { status: 303 });
  }

  if (resolution.status !== "ready") {
    await session.save();
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

  await session.save();
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
