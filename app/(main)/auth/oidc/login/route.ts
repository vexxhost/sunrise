import { NextResponse } from "next/server";
import { normalizeAuthReturnTo } from "@/lib/auth-return";
import { parseIdentityProviders } from "@/lib/auth-providers";
import {
  AUTH_PROMPT_COOKIE,
  parseOidcAuthorizationPrompt,
} from "@/lib/auth-prompt";
import { getSession } from "@/lib/session";
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
  if (!idp || !idProviders.includes(idp)) {
    return new NextResponse("Invalid identity provider", { status: 400 });
  }

  const { verifier, challenge } = generatePkce();
  const state = generateState();

  const session = await getSession();
  session.oidcVerifier = verifier;
  session.oidcState = state;
  session.oidcIdProvider = idp;
  session.oidcReturnTo = returnTo === "/" ? undefined : returnTo;
  await session.save();

  const authorizeUrl = await buildAuthorizeUrl({ challenge, state, prompt });
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(AUTH_PROMPT_COOKIE, "", {
    expires: new Date(0),
    path: "/",
  });
  return response;
}
