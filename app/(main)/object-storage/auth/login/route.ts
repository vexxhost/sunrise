import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  discoverOidc,
  generatePkce,
  generateState,
  getOidcConfig,
} from '@/lib/s3/oidc';

export async function GET() {
  const { authorization_endpoint } = await discoverOidc();
  const { clientId, redirectUri } = getOidcConfig();

  const { verifier, challenge } = generatePkce();
  const state = generateState();

  const session = await getSession();
  session.s3OidcVerifier = verifier;
  session.s3OidcState = state;
  await session.save();

  const url = new URL(authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url);
}
