'use client';

import { S3Client } from '@aws-sdk/client-s3';
import type { S3StsCredentials } from '@/lib/session';

export function makeBrowserS3Client(
  creds: S3StsCredentials,
  endpoint: string,
  region: string
): S3Client {
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}
