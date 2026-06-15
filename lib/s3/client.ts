import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent } from 'https';
import { getSession } from '@/lib/session';
import { getS3Endpoint, S3_REGION } from '@/lib/s3/endpoint';
import { ensureActiveProjectS3Credentials } from '@/lib/s3/session';

export class S3AuthRequiredError extends Error {
  constructor() {
    super('S3 STS credentials missing or expired');
    this.name = 'S3AuthRequiredError';
  }
}

export async function getS3Client(): Promise<S3Client> {
  const session = await getSession();
  const creds = await ensureActiveProjectS3Credentials(session);

  if (!creds) {
    throw new S3AuthRequiredError();
  }

  const endpoint = await getS3Endpoint();

  return new S3Client({
    endpoint,
    region: S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
    requestHandler: new NodeHttpHandler({
      httpsAgent: new Agent({
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
      }),
    }),
  });
}
