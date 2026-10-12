import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeAuthReturnTo } from "@/lib/auth-return";
import { parseIdentityProviders } from "@/lib/auth-providers";
import {
  AUTH_PROMPT_COOKIE,
  parseOidcAuthorizationPrompt,
} from "@/lib/auth-prompt";
import { getSession } from "@/lib/session";
import { isStoredSessionSupersededError } from "@/lib/session-errors";
import { saveRedisSession } from "@/lib/session-store";
import { SESSION_EXPIRY_NOTICE_COOKIE } from "@/lib/session-lifetime";
import {
  buildAuthorizeUrl,
  generatePkce,
  generateState,
} from "@/lib/oidc/sunrise";

const idProviders = parseIdentityProviders(
  process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS,
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const idp = url.searchParams.get("idp");
  const prompt = parseOidcAuthorizationPrompt(url.searchParams.get("prompt"));
  const returnTo = normalizeAuthReturnTo(url.searchParams.get("returnTo"));
  const continuation = url.searchParams.get("continuation") === "1";
  if (!idp || !idProviders.includes(idp)) {
    return new NextResponse("Invalid identity provider", { status: 400 });
  }

  const { verifier, challenge } = generatePkce();
  const state = generateState();

  const session = await getSession();
  if (continuation && session.sessionExpiryReason) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  session.oidcVerifier = verifier;
  session.oidcState = state;
  session.oidcFlowId = randomUUID();
  session.oidcIdProvider = idp;
  session.oidcReturnTo = returnTo === "/" ? undefined : returnTo;
  session.oidcSessionContinuation = continuation || undefined;
  try {
    await saveRedisSession(session, { recoverRotatedSession: true });
  } catch (error) {
    if (isStoredSessionSupersededError(error)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    throw error;
  }

  const authorizeUrl = await buildAuthorizeUrl({
    identityProvider: idp,
    challenge,
    state,
    prompt,
  });
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(AUTH_PROMPT_COOKIE, "", {
    expires: new Date(0),
    path: "/",
  });
  response.cookies.set(SESSION_EXPIRY_NOTICE_COOKIE, "", {
    expires: new Date(0),
    path: "/",
  });
  return response;
}
