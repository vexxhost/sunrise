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
  const session = await getSession();
  if (session.sessionExpiryReason) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  try {
    await getS3Endpoint();
  } catch {
    return NextResponse.redirect(new URL("/object-storage", request.url));
  }

  const { authorization_endpoint } = await discoverOidc();
  const { clientId, redirectUri } = getOidcConfig();
  const { verifier, challenge } = generatePkce();
  const state = generateState();

  session.s3OidcVerifier = verifier;
  session.s3OidcState = state;
  session.s3OidcReturnTo = normalizeObjectStorageReturnTo(
    new URL(request.url).searchParams.get("returnTo"),
  );
  await session.save();

  const url = new URL(authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
