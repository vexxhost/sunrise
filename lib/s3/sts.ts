import { STSClient, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent } from 'https';
import type { S3StsCredentials } from '@/lib/session';

function getStsClient() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'us-east-1';
  if (!endpoint) throw new Error('S3_ENDPOINT not set');
  return new STSClient({
    endpoint,
    region,
    requestHandler: new NodeHttpHandler({
      httpsAgent: new Agent({
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
      }),
    }),
  });
}

export async function assumeRoleWithIdToken(
  idToken: string
): Promise<S3StsCredentials> {
  const roleArn = process.env.S3_STS_ROLE_ARN;
  if (!roleArn) throw new Error('S3_STS_ROLE_ARN not set');

  const client = getStsClient();
  const res = await client.send(
    new AssumeRoleWithWebIdentityCommand({
      RoleArn: roleArn,
      RoleSessionName: `sunrise-${Date.now()}`,
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
  };
}
