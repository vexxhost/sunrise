import Login from "@/components/Auth/Login";
import { AuthRecovery } from "@/components/Auth/AuthRecovery";
import { SessionRefreshRedirect } from "@/components/Auth/SessionRefreshRedirect";
import {
  AUTH_PROMPT_COOKIE,
  parseOidcAuthorizationPrompt,
} from "@/lib/auth-prompt";
import { getKeystoneSessionState } from "@/lib/keystone/session";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";

export default async function Provider({ children }: any) {
  const session = await getSession();
  const cookieStore = await cookies();
  const authorizationPrompt = parseOidcAuthorizationPrompt(
    cookieStore.get(AUTH_PROMPT_COOKIE)?.value,
  );

  if (!session.keystone_unscoped_token) {
    if (session.oidcIdentity && session.authRecovery) {
      return (
        <AuthRecovery
          identity={session.oidcIdentity}
          reason={session.authRecovery.reason}
        />
      );
    }
    if (session.oidcIdentity && session.keycloakRefreshToken) {
      return <SessionRefreshRedirect />;
    }
    return <Login authorizationPrompt={authorizationPrompt} />;
  }

  const sessionState = await getKeystoneSessionState(session);
  if (sessionState.status === "missing") {
    return <Login authorizationPrompt={authorizationPrompt} />;
  }

  if (sessionState.status === "invalid") {
    return <SessionRefreshRedirect />;
  }

  if (sessionState.status === "unknown") {
    return (
      <AuthRecovery
        identity={session.oidcIdentity}
        reason={session.authRecovery?.reason ?? "session-unavailable"}
      />
    );
  }

  if (!session.projectId || !session.keystoneProjectToken) {
    return (
      <AuthRecovery
        identity={session.oidcIdentity}
        reason={session.authRecovery?.reason ?? "no-projects"}
      />
    );
  }

  return <>{children}</>;
}
