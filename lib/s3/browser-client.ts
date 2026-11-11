'use client';

import { S3Client } from '@aws-sdk/client-s3';
import type { S3StsCredentials } from '@/lib/session';

type RefreshBrowserCredentials = () => Promise<S3StsCredentials>;

function sdkCredentials(credentials: S3StsCredentials) {
  return {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
    expiration: new Date(credentials.expiration),
  };
}

export function makeBrowserS3Client(
  creds: S3StsCredentials,
  endpoint: string,
  region: string,
  refreshCredentials?: RefreshBrowserCredentials
): S3Client {
  let current = creds;
  let pendingRefresh: Promise<S3StsCredentials> | null = null;

  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    // Automatic flexible checksums currently pass browser File bodies to a
    // ReadableStream-only encoder. Keep File uploads streaming to RGW instead
    // of buffering them into an ArrayBuffer as a workaround.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: async () => {
      if (!refreshCredentials || current.expiration - Date.now() >= 5 * 60_000) {
        return sdkCredentials(current);
      }

      pendingRefresh ??= refreshCredentials().finally(() => {
        pendingRefresh = null;
      });
      current = await pendingRefresh;
      return sdkCredentials(current);
    },
  });
}
