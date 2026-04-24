import { STSClient, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent } from 'https';
import type { S3StsCredentials } from '@/lib/session';
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
  idToken: string
): Promise<S3StsCredentials> {
  const roleArn = process.env.S3_STS_ROLE_ARN;
  if (!roleArn) throw new Error('S3_STS_ROLE_ARN not set');

  const client = await getStsClient();
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
