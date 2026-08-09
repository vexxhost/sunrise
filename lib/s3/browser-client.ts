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
    // Automatic flexible checksums currently pass browser File bodies to a
    // ReadableStream-only encoder. Keep File uploads streaming to RGW instead
    // of buffering them into an ArrayBuffer as a workaround.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}
