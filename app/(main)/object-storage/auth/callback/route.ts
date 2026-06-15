import { NextResponse } from 'next/server';
import {
  getSession,
  normalizeProjectId,
  setS3CredentialsForProject,
} from '@/lib/session';
import { exchangeCodeForTokens } from '@/lib/s3/oidc';
import {
  assumeRoleWithIdToken,
  tryExtractRgwProjectRoles,
} from '@/lib/s3/sts';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const session = await getSession();
  const expectedState = session.s3OidcState;
  const verifier = session.s3OidcVerifier;

  // Clear single-use values regardless of outcome
  session.s3OidcState = undefined;
  session.s3OidcVerifier = undefined;

  if (error) {
    await session.save();
    return new NextResponse(`OIDC error: ${error}`, { status: 400 });
  }
  if (!code || !state || !verifier) {
    await session.save();
    return new NextResponse('Missing OIDC parameters', { status: 400 });
  }
  if (state !== expectedState) {
    await session.save();
    return new NextResponse('OIDC state mismatch', { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code, verifier);
    const projectRoles = tryExtractRgwProjectRoles(
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
    const creds = await assumeRoleWithIdToken(tokens.id_token, projectId, roleArn);
    setS3CredentialsForProject(session, creds);
    await session.save();
  } catch (e) {
    await session.save();
    const msg = e instanceof Error ? e.message : 'unknown error';
    return new NextResponse(`S3 auth failed: ${msg}`, { status: 500 });
  }

  return NextResponse.redirect(`${process.env.DASHBOARD_URL}/object-storage`);
}
