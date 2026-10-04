import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  discoverOidc,
  generatePkce,
  generateState,
  getOidcConfig,
  normalizeObjectStorageReturnTo,
} from "@/lib/s3/oidc";
import { getS3Endpoint } from "@/lib/s3/endpoint";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = normalizeObjectStorageReturnTo(
    requestUrl.searchParams.get("returnTo"),
  );
  const session = await getSession();
  if (session.sessionExpiryReason) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  try {
    await getS3Endpoint();
  } catch {
    return NextResponse.redirect(new URL("/object-storage", request.url));
  }

  const identityProvider =
    session.federationIdentityProvider ??
    session.oidcIdentity?.identityProvider;
  if (!identityProvider) {
    const unavailable = new URL(
      "/object-storage/auth/unavailable",
      request.url,
    );
    unavailable.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(unavailable, { status: 303 });
  }

  let authorizationEndpoint: string;
  let clientId: string;
  let redirectUri: string;
  try {
    const discovery = await discoverOidc(identityProvider);
    const config = getOidcConfig(identityProvider);
    authorizationEndpoint = discovery.authorization_endpoint;
    clientId = config.clientId;
    redirectUri = config.redirectUri;
  } catch {
    const unavailable = new URL(
      "/object-storage/auth/unavailable",
      request.url,
    );
    unavailable.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(unavailable, { status: 303 });
  }
  const { verifier, challenge } = generatePkce();
  const state = generateState();

  session.s3OidcVerifier = verifier;
  session.s3OidcState = state;
  session.s3OidcReturnTo = returnTo;
  session.s3OidcPendingIdentityProvider = identityProvider;
  await session.save();

  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
