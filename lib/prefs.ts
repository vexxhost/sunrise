'use server';

import { cookies } from 'next/headers';
import {
  parseResourcePreferences,
  serializeResourcePreferences,
  type ResourcePreference,
} from '@/lib/resource-preferences';
import {
  parseSunriseAppearance,
  type SunriseAppearance,
} from '@/lib/theme-preference';

const PREFS_COOKIE = 'sunrise_prefs';
const PREFS_MAX_AGE_DAYS = 365;
const PREFS_COOKIE_SAFE_LENGTH = 3800;

export type SunrisePrefs = {
  appearance?: SunriseAppearance;
  regionId?: string;
  projectId?: string;
  projectName?: string;
  recentResources?: ResourcePreference[];
  pinnedResources?: ResourcePreference[];
};

export async function readPrefs(): Promise<SunrisePrefs> {
  const store = await cookies();
  const raw = store.get(PREFS_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        appearance: parseSunriseAppearance(parsed.appearance),
        regionId:
          typeof parsed.regionId === 'string' ? parsed.regionId : undefined,
        projectId:
          typeof parsed.projectId === 'string' ? parsed.projectId : undefined,
        projectName:
          typeof parsed.projectName === 'string'
            ? parsed.projectName
            : undefined,
        recentResources: parseResourcePreferences(parsed.recentResources),
        pinnedResources: parseResourcePreferences(parsed.pinnedResources),
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
  const serialized = {
    ...next,
    recentResources: serializeResourcePreferences(next.recentResources),
    pinnedResources: serializeResourcePreferences(next.pinnedResources),
  };

  const recent = serialized.recentResources;
  const pinned = serialized.pinnedResources;
  let value = JSON.stringify(serialized);
  while (
    encodeURIComponent(value).length > PREFS_COOKIE_SAFE_LENGTH &&
    (recent.length > 0 || pinned.length > 0)
  ) {
    if (recent.length > 0) recent.pop();
    else pinned.pop();
    value = JSON.stringify(serialized);
  }

  const store = await cookies();
  store.set(PREFS_COOKIE, value, {
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
