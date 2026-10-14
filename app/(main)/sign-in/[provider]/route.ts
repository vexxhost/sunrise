import { NextResponse } from "next/server";
import {
  findIdentityProviderBySignInSlug,
  getIdentityProviderOptions,
} from "@/lib/auth-providers";
import { normalizeAuthReturnTo } from "@/lib/auth-return";
import { parseOidcAuthorizationPrompt } from "@/lib/auth-prompt";

const identityProviders = getIdentityProviderOptions();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: signInSlug } = await params;
  const provider = findIdentityProviderBySignInSlug(
    identityProviders,
    signInSlug,
  );
  if (!provider) {
    return new NextResponse("Identity provider not found", { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const returnTo = normalizeAuthReturnTo(
    requestUrl.searchParams.get("returnTo"),
  );
  const prompt = parseOidcAuthorizationPrompt(
    requestUrl.searchParams.get("prompt"),
  );
  const destination = new URL("/auth/oidc/login", requestUrl);
  destination.searchParams.set("idp", provider.id);
  if (returnTo !== "/") destination.searchParams.set("returnTo", returnTo);
  if (prompt) destination.searchParams.set("prompt", prompt);

  return NextResponse.redirect(destination);
}
