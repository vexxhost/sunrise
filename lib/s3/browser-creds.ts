'use server';

import { getSession } from '@/lib/session';
import type { S3StsCredentials } from '@/lib/session';
import { getS3Endpoint, S3_REGION } from '@/lib/s3/endpoint';
import { ensureActiveProjectS3Credentials } from '@/lib/s3/session';

export type BrowserStsResult =
  | { ok: true; credentials: S3StsCredentials; endpoint: string; region: string }
  | { ok: false; needsAuth: true }
  | { ok: false; needsAuth: false; error: string };

/**
 * Returns STS temp credentials for browser-side use.
 *
 * SECURITY NOTE: This exposes scoped temp credentials to the browser. They
 * inherit the role permissions and expire (default 1h). Only use over HTTPS
 * in production.
 */
export async function getStsCredentialsForBrowser(): Promise<BrowserStsResult> {
  const session = await getSession();
  const { creds, refreshed } = await ensureActiveProjectS3Credentials(session);
  if (refreshed) {
    await session.save();
  }

  if (!creds) {
    return { ok: false, needsAuth: true };
  }
  let endpoint: string;
  try {
    endpoint = await getS3Endpoint();
  } catch (e) {
    return {
      ok: false,
      needsAuth: false,
      error: e instanceof Error ? e.message : 'failed to resolve S3 endpoint',
    };
  }
  return { ok: true, credentials: creds, endpoint, region: S3_REGION };
}
