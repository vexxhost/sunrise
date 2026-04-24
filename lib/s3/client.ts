import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent } from 'https';
import { getSession } from '@/lib/session';

export class S3AuthRequiredError extends Error {
  constructor() {
    super('S3 STS credentials missing or expired');
    this.name = 'S3AuthRequiredError';
  }
}

export async function getS3Client(): Promise<S3Client> {
  const session = await getSession();
  const creds = session.s3Sts;
  // Refresh threshold: 60s before expiry
  if (!creds || creds.expiration - Date.now() < 60_000) {
    throw new S3AuthRequiredError();
  }
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'us-east-1';
  if (!endpoint) throw new Error('S3_ENDPOINT not set');

  return new S3Client({
    endpoint,
    region,
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
