import Login from "@/components/Auth/Login";
import { AuthRecovery } from "@/components/Auth/AuthRecovery";
import { SessionExpired } from "@/components/Auth/SessionExpired";
import { SessionLifetimeMonitor } from "@/components/Auth/SessionLifetimeMonitor";
import { SessionRefreshRedirect } from "@/components/Auth/SessionRefreshRedirect";
import { hasFreshCloudContextBootstrap } from "@/lib/cloud-context-bootstrap";
import {
  AUTH_PROMPT_COOKIE,
  parseOidcAuthorizationPrompt,
} from "@/lib/auth-prompt";
import {
  isReturningVisitor,
  REMEMBERED_IDENTITY_PROVIDER_COOKIE,
  RETURNING_VISITOR_COOKIE,
} from "@/lib/auth-visitor";
import {
  findIdentityProviderById,
  getIdentityProviderOptions,
} from "@/lib/auth-providers";
import {
  AUTH_RETURN_TO_COOKIE,
  normalizeAuthReturnTo,
} from "@/lib/auth-return";
import { getKeystoneSessionState } from "@/lib/keystone/session";
import { getSession } from "@/lib/session";
import {
  getSessionLifetimeState,
  parseSessionExpiryReason,
  SESSION_EXPIRY_NOTICE_COOKIE,
} from "@/lib/session-lifetime";
import { cookies } from "next/headers";

export default async function Provider({ children }: any) {
  const session = await getSession();
  const cookieStore = await cookies();
  const authorizationPrompt = parseOidcAuthorizationPrompt(
    cookieStore.get(AUTH_PROMPT_COOKIE)?.value,
  );
  const expiryNotice = parseSessionExpiryReason(
    cookieStore.get(SESSION_EXPIRY_NOTICE_COOKIE)?.value,
  );
  const returningVisitor =
    isReturningVisitor(cookieStore.get(RETURNING_VISITOR_COOKIE)?.value) ||
    Boolean(expiryNotice);
  const configuredProviders = getIdentityProviderOptions();
  const rememberedProviderValue = cookieStore.get(
    REMEMBERED_IDENTITY_PROVIDER_COOKIE,
  )?.value;
  const rememberedProvider = rememberedProviderValue
    ? findIdentityProviderById(configuredProviders, rememberedProviderValue)
    : undefined;
  const initialReturnTo = normalizeAuthReturnTo(
    cookieStore.get(AUTH_RETURN_TO_COOKIE)?.value,
  );

  if (session.sessionExpiryReason) {
    return (
      <SessionExpired
        identity={session.oidcIdentity}
        reason={session.sessionExpiryReason}
      />
    );
  }

  const lifetime = getSessionLifetimeState(session);
  const monitor =
    lifetime.status === "active" && session.sessionId ? (
      <SessionLifetimeMonitor
        initial={{ ...lifetime, sessionId: session.sessionId }}
      />
    ) : null;

  if (!session.keystone_unscoped_token) {
    if (session.oidcIdentity && session.authRecovery) {
      return (
        <>
          {monitor}
          <AuthRecovery
            identity={session.oidcIdentity}
            reason={session.authRecovery.reason}
          />
        </>
      );
    }
    if (session.oidcIdentity && session.keycloakRefreshToken) {
      return (
        <>
          {monitor}
          <SessionRefreshRedirect />
        </>
      );
    }
    return (
      <Login
        authorizationPrompt={authorizationPrompt}
        initialReturnTo={initialReturnTo}
        rememberedProvider={
          rememberedProvider
            ? {
                displayName: rememberedProvider.displayName,
                signInSlug: rememberedProvider.signInSlug,
              }
            : undefined
        }
        returningVisitor={returningVisitor}
        sessionExpiryReason={expiryNotice}
      />
    );
  }

  // The callback has just minted both Keystone tokens and hands its discovery
  // results to this first request for at most 30 seconds. Skip the otherwise
  // immediate duplicate token validation; a cache miss still uses the normal
  // validation path, including when the request lands on another replica.
  const sessionState = hasFreshCloudContextBootstrap(
    session.cloudContextBootstrapId,
  )
    ? ({ status: "valid" } as const)
    : await getKeystoneSessionState(session);
  if (sessionState.status === "missing") {
    return (
      <Login
        authorizationPrompt={authorizationPrompt}
        initialReturnTo={initialReturnTo}
        rememberedProvider={
          rememberedProvider
            ? {
                displayName: rememberedProvider.displayName,
                signInSlug: rememberedProvider.signInSlug,
              }
            : undefined
        }
        returningVisitor={returningVisitor}
        sessionExpiryReason={expiryNotice}
      />
    );
  }

  if (sessionState.status === "invalid") {
    return (
      <>
        {monitor}
        <SessionRefreshRedirect />
      </>
    );
  }

  if (sessionState.status === "unknown") {
    return (
      <>
        {monitor}
        <AuthRecovery
          identity={session.oidcIdentity}
          reason={session.authRecovery?.reason ?? "session-unavailable"}
        />
      </>
    );
  }

  if (!session.projectId || !session.keystoneProjectToken) {
    return (
      <>
        {monitor}
        <AuthRecovery
          identity={session.oidcIdentity}
          reason={session.authRecovery?.reason ?? "no-projects"}
        />
      </>
    );
  }

  return (
    <>
      {monitor}
      {children}
    </>
  );
}
