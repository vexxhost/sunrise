'use server';

import { getSession } from '@/lib/session';
import type { S3StsCredentials } from '@/lib/session';
import { getS3Endpoint, S3_REGION } from '@/lib/s3/endpoint';
import {
  ensureActiveProjectS3Credentials,
  S3ProjectRoleUnavailableError,
} from '@/lib/s3/session';

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
  let creds;
  try {
    creds = await ensureActiveProjectS3Credentials(session);
  } catch (error) {
    if (error instanceof S3ProjectRoleUnavailableError) {
      return { ok: false, needsAuth: true };
    }
    throw error;
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
