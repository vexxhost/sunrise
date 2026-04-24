'use server';

import { getSession } from '@/lib/session';
import type { S3StsCredentials } from '@/lib/session';

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
  const creds = session.s3Sts;
  if (!creds || creds.expiration - Date.now() < 60_000) {
    return { ok: false, needsAuth: true };
  }
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'us-east-1';
  if (!endpoint) {
    return { ok: false, needsAuth: false, error: 'S3_ENDPOINT not set' };
  }
  return { ok: true, credentials: creds, endpoint, region };
}
