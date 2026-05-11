'use server';

import { cookies } from 'next/headers';

const PREFS_COOKIE = 'sunrise_prefs';
const PREFS_MAX_AGE_DAYS = 365;

export type SunrisePrefs = {
  regionId?: string;
  projectId?: string;
  projectName?: string;
};

export async function readPrefs(): Promise<SunrisePrefs> {
  const store = await cookies();
  const raw = store.get(PREFS_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        regionId:
          typeof parsed.regionId === 'string' ? parsed.regionId : undefined,
        projectId:
          typeof parsed.projectId === 'string' ? parsed.projectId : undefined,
        projectName:
          typeof parsed.projectName === 'string'
            ? parsed.projectName
            : undefined,
      };
    }
  } catch {
    // ignore malformed cookie
  }
  return {};
}

export async function writePrefs(patch: Partial<SunrisePrefs>): Promise<void> {
  const current = await readPrefs();
  const next: SunrisePrefs = { ...current, ...patch };
  const store = await cookies();
  store.set(PREFS_COOKIE, JSON.stringify(next), {
    path: '/',
    maxAge: PREFS_MAX_AGE_DAYS * 24 * 60 * 60,
    // SameSite=None + Secure is required so the cookie is sent on the
    // cross-site POST that Keystone makes back to /auth/websso after a
    // federated login. Browsers accept Secure cookies on http://localhost
    // because localhost is treated as a secure context.
    sameSite: 'none',
    secure: true,
    httpOnly: false, // not sensitive; allow client read if ever needed
  });
}
