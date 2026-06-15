import { NextResponse } from 'next/server';
import {
  getSession,
  normalizeProjectId,
  setS3CredentialsForProject,
} from '@/lib/session';
import {
  exchangeCodeForTokens,
  tokenExchangeForRgw,
} from '@/lib/oidc/sunrise';
import {
  federateOidcWithKeystone,
  finalizeKeystoneSession,
} from '@/lib/keystone/login';
import {
  assumeRoleWithIdToken,
  tryExtractRgwProjectRoles,
} from '@/lib/s3/sts';

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? '/';
const PROTOCOL =
  process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL ?? 'openid';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const session = await getSession();
  const expectedState = session.oidcState;
  const verifier = session.oidcVerifier;
  const idp = session.oidcIdProvider;

  // Single-use values; clear regardless of outcome.
  session.oidcState = undefined;
  session.oidcVerifier = undefined;
  session.oidcIdProvider = undefined;

  if (errorParam) {
    await session.save();
    return new NextResponse(`OIDC error: ${errorParam}`, { status: 400 });
  }
  if (!code || !state || !verifier || !idp) {
    await session.save();
    return new NextResponse('Missing OIDC parameters', { status: 400 });
  }
  if (state !== expectedState) {
    await session.save();
    return new NextResponse('OIDC state mismatch', { status: 400 });
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, verifier);
  } catch (e) {
    await session.save();
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('[oidc/callback] code exchange failed:', msg);
    return new NextResponse(`Login failed: ${msg}`, { status: 500 });
  }

  if (tokens.refresh_token) {
    session.keycloakRefreshToken = tokens.refresh_token;
  }

  // 1. Federate into Keystone.
  let unscopedToken: string;
  try {
    unscopedToken = await federateOidcWithKeystone(
      tokens.access_token,
      idp,
      PROTOCOL
    );
  } catch (e) {
    await session.save();
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('[oidc/callback] Keystone federation failed:', msg);
    return new NextResponse(`Keystone federation failed: ${msg}`, {
      status: 500,
    });
  }

  try {
    await finalizeKeystoneSession(session, unscopedToken);
    // Persist now so subsequent getSession() calls in this request (used by
    // the S3 endpoint resolver during STS exchange below) see the new
    // regionId / project token. iron-session in-memory mutations are not
    // visible to a second getSession() within the same request — only the
    // saved cookie is.
    await session.save();
  } catch (e) {
    await session.save();
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('[oidc/callback] Keystone session finalize failed:', msg);
    return new NextResponse(`Keystone session error: ${msg}`, { status: 500 });
  }

  // 2. Token-exchange + STS for S3.
  try {
    const exchanged = await tokenExchangeForRgw(tokens.access_token);
    const rgwIdToken = exchanged.id_token ?? exchanged.access_token;
    const projectRoles = tryExtractRgwProjectRoles(
      rgwIdToken,
      exchanged.id_token,
      exchanged.access_token,
      tokens.id_token,
      tokens.access_token
    );
    if (!projectRoles) {
      throw new Error('RGW project roles claim is missing from token');
    }
    const projectId = normalizeProjectId(session.projectId);
    const roleArn = projectRoles[projectId];
    if (!roleArn) {
      throw new Error(`No RGW role ARN found for active project ${projectId}`);
    }

    session.s3ProjectRoles = projectRoles;
    const creds = await assumeRoleWithIdToken(rgwIdToken, projectId, roleArn);
    setS3CredentialsForProject(session, creds);
  } catch (e) {
    // Non-fatal: user can still use other services. S3 pages will redirect
    // to `/object-storage/auth/login` if S3 credentials are missing.
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('[oidc/callback] STS exchange failed (non-fatal):', msg);
  }

  await session.save();
  return NextResponse.redirect(DASHBOARD_URL, { status: 303 });
}
