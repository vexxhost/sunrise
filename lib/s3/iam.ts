import 'server-only';

import { IAMClient } from '@aws-sdk/client-iam';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent } from 'https';
import {
  getActiveS3Credentials,
  getSession,
  normalizeProjectId,
} from '@/lib/session';
import { S3AuthRequiredError } from '@/lib/s3/client';
import { getS3Endpoint, S3_REGION } from '@/lib/s3/endpoint';
import { ensureActiveProjectS3Credentials } from '@/lib/s3/session';

export type ActiveRoleIamContext = {
  client: IAMClient;
  roleArn: string;
  roleName: string;
};

type ActiveRoleIamContextOptions = {
  allowCredentialRefresh?: boolean;
};

export function roleNameFromArn(roleArn: string): string {
  const match = /^arn:[^:]+:iam::[^:]+:role\/(.+)$/.exec(roleArn);
  const roleResource = match?.[1];
  const roleName = roleResource?.split('/').filter(Boolean).at(-1);

  if (!roleName) {
    throw new Error(`Invalid IAM role ARN: ${roleArn}`);
  }

  return roleName;
}

export async function getActiveRoleIamContext(
  options: ActiveRoleIamContextOptions = {}
): Promise<ActiveRoleIamContext> {
  const session = await getSession();
  const projectId = normalizeProjectId(session.projectId);
  if (!projectId) {
    throw new Error('No active project in session');
  }

  const credentials = options.allowCredentialRefresh
    ? await ensureActiveProjectS3Credentials(session)
    : getActiveS3Credentials(session);
  if (!credentials) {
    throw new S3AuthRequiredError();
  }

  const roleArn = session.s3ProjectRoles?.[projectId];
  if (!roleArn) {
    throw new Error(`No RGW role ARN found for project ${projectId}`);
  }

  const endpoint = await getS3Endpoint();
  const client = new IAMClient({
    endpoint,
    region: S3_REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    requestHandler: new NodeHttpHandler({
      httpsAgent: new Agent({
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
      }),
    }),
  });

  return {
    client,
    roleArn,
    roleName: roleNameFromArn(roleArn),
  };
}
