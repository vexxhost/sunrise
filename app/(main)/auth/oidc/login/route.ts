import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  buildAuthorizeUrl,
  generatePkce,
  generateState,
} from '@/lib/oidc/sunrise';

const idProvidersEnv = process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS;
const idProviders = idProvidersEnv ? idProvidersEnv.split(',') : [];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const idp = url.searchParams.get('idp');
  if (!idp || !idProviders.includes(idp)) {
    return new NextResponse('Invalid identity provider', { status: 400 });
  }

  const { verifier, challenge } = generatePkce();
  const state = generateState();

  const session = await getSession();
  session.oidcVerifier = verifier;
  session.oidcState = state;
  session.oidcIdProvider = idp;
  await session.save();

  const authorizeUrl = await buildAuthorizeUrl({ challenge, state });
  return NextResponse.redirect(authorizeUrl);
}
