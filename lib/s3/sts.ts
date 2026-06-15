import { STSClient, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent } from 'https';
import type { S3StsCredentials } from '@/lib/session';
import { normalizeProjectId } from '@/lib/session';
import { getS3Endpoint, S3_REGION } from '@/lib/s3/endpoint';

async function getStsClient() {
  const endpoint = await getS3Endpoint();
  return new STSClient({
    endpoint,
    region: S3_REGION,
    requestHandler: new NodeHttpHandler({
      httpsAgent: new Agent({
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
      }),
    }),
  });
}

export async function assumeRoleWithIdToken(
  idToken: string,
  projectId: string,
  roleArn?: string
): Promise<S3StsCredentials> {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) {
    throw new Error('Active project is required for S3 STS');
  }

  const resolvedRoleArn =
    roleArn ?? extractRgwProjectRoles(idToken)[normalizedProjectId];

  if (!resolvedRoleArn) {
    throw new Error(`No RGW role ARN found for project ${normalizedProjectId}`);
  }

  const client = await getStsClient();
  const res = await client.send(
    new AssumeRoleWithWebIdentityCommand({
      RoleArn: resolvedRoleArn,
      RoleSessionName: `sunrise-${normalizedProjectId.slice(0, 20)}`,
      WebIdentityToken: idToken,
      DurationSeconds: 3600,
    })
  );
  const c = res.Credentials;
  if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken || !c.Expiration) {
    throw new Error('STS returned incomplete credentials');
  }
  return {
    accessKeyId: c.AccessKeyId,
    secretAccessKey: c.SecretAccessKey,
    sessionToken: c.SessionToken,
    expiration: c.Expiration.getTime(),
    projectId: normalizedProjectId,
  };
}

function parseJwtClaims(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (!payload) throw new Error('JWT payload is missing');

  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64url').toString('utf-8')) as Record<
    string,
    unknown
  >;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectProjectRoles(value: unknown): Record<string, string> {
  const entries = Array.isArray(value) ? value : [value];
  const projectRoles: Record<string, string> = {};

  for (const entry of entries) {
    if (!isRecord(entry)) continue;

    for (const [projectId, roleArn] of Object.entries(entry)) {
      if (typeof roleArn !== 'string' || !roleArn.trim()) continue;

      const normalizedProjectId = normalizeProjectId(projectId);
      if (normalizedProjectId) {
        projectRoles[normalizedProjectId] = roleArn.trim();
      }
    }
  }

  return projectRoles;
}

export function extractRgwProjectRoles(token: string): Record<string, string> {
  const claims = parseJwtClaims(token);
  const rawProjectRoles = claims.rgw_project_roles;

  if (!rawProjectRoles) {
    throw new Error('RGW project roles claim is missing from token');
  }

  const projectRoles = collectProjectRoles(rawProjectRoles);

  if (Object.keys(projectRoles).length === 0) {
    throw new Error('RGW project roles claim did not contain usable roles');
  }

  return projectRoles;
}

export function tryExtractRgwProjectRoles(
  ...tokens: Array<string | undefined>
): Record<string, string> | undefined {
  for (const token of tokens) {
    if (!token) continue;

    try {
      return extractRgwProjectRoles(token);
    } catch {
      // The role discovery claim is intended for Sunrise tokens. RGW audience
      // tokens may omit it while still carrying the AWS session tags RGW needs.
    }
  }

  return undefined;
}
