"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import {
  parseResourcePreferences,
  serializeResourcePreferences,
  type ResourcePreference,
} from "@/lib/resource-preferences";
import {
  parseSunriseAppearance,
  type SunriseAppearance,
} from "@/lib/theme-preference";
import {
  parseFavoriteDestinationIds,
  type NavigationDestinationId,
} from "@/lib/navigation-destinations";
import type { PreferenceIdentity } from "@/lib/preference-identity";

const PREFS_COOKIE = "sunrise_prefs";
const ACCOUNT_PREFS_COOKIE_PREFIX = `${PREFS_COOKIE}_account_`;
const PREFS_MAX_AGE_DAYS = 365;
const PREFS_COOKIE_SAFE_LENGTH = 3800;

export type SunrisePrefs = {
  appearance?: SunriseAppearance;
  regionId?: string;
  projectId?: string;
  projectName?: string;
  recentResources?: ResourcePreference[];
  pinnedResources?: ResourcePreference[];
  favoriteDestinations?: NavigationDestinationId[];
};

type AccountPrefs = Omit<SunrisePrefs, "appearance">;
type CookieStore = Awaited<ReturnType<typeof cookies>>;

function parseCookie(value?: string): SunrisePrefs {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return {
        appearance: parseSunriseAppearance(parsed.appearance),
        regionId:
          typeof parsed.regionId === "string" ? parsed.regionId : undefined,
        projectId:
          typeof parsed.projectId === "string" ? parsed.projectId : undefined,
        projectName:
          typeof parsed.projectName === "string"
            ? parsed.projectName
            : undefined,
        recentResources: parseResourcePreferences(parsed.recentResources),
        pinnedResources: parseResourcePreferences(parsed.pinnedResources),
        favoriteDestinations: parseFavoriteDestinationIds(
          parsed.favoriteDestinations,
        ),
      };
    }
  } catch {
    // Ignore malformed preference cookies.
  }
  return {};
}

function accountCookieName(identity: PreferenceIdentity) {
  const identityDigest = createHash("sha256")
    .update(identity.issuer)
    .update("\0")
    .update(identity.subject)
    .digest("hex")
    .slice(0, 32);
  return `${ACCOUNT_PREFS_COOKIE_PREFIX}${identityDigest}`;
}

function accountPrefs(prefs: SunrisePrefs): AccountPrefs {
  return {
    regionId: prefs.regionId,
    projectId: prefs.projectId,
    projectName: prefs.projectName,
    recentResources: prefs.recentResources,
    pinnedResources: prefs.pinnedResources,
    favoriteDestinations: prefs.favoriteDestinations,
  };
}

function serializeAccountPrefs(next: AccountPrefs) {
  const serialized = {
    ...next,
    recentResources: serializeResourcePreferences(next.recentResources),
    pinnedResources: serializeResourcePreferences(next.pinnedResources),
    favoriteDestinations: parseFavoriteDestinationIds(
      next.favoriteDestinations,
    ),
  };

  const recent = serialized.recentResources;
  const pinned = serialized.pinnedResources;
  const favorites = serialized.favoriteDestinations;
  let value = JSON.stringify(serialized);
  while (
    encodeURIComponent(value).length > PREFS_COOKIE_SAFE_LENGTH &&
    (recent.length > 0 || pinned.length > 0 || favorites.length > 0)
  ) {
    if (recent.length > 0) recent.pop();
    else if (pinned.length > 0) pinned.pop();
    else favorites.pop();
    value = JSON.stringify(serialized);
  }
  return value;
}

function accountPatch(patch: Partial<SunrisePrefs>) {
  const scoped: Partial<AccountPrefs> = {};
  if ("regionId" in patch) scoped.regionId = patch.regionId;
  if ("projectId" in patch) scoped.projectId = patch.projectId;
  if ("projectName" in patch) scoped.projectName = patch.projectName;
  if ("recentResources" in patch) {
    scoped.recentResources = patch.recentResources;
  }
  if ("pinnedResources" in patch) {
    scoped.pinnedResources = patch.pinnedResources;
  }
  if ("favoriteDestinations" in patch) {
    scoped.favoriteDestinations = patch.favoriteDestinations;
  }
  return scoped;
}

function setPreferenceCookie(
  store: CookieStore,
  name: string,
  value: string,
  httpOnly: boolean,
) {
  store.set(name, value, {
    path: "/",
    maxAge: PREFS_MAX_AGE_DAYS * 24 * 60 * 60,
    // Preserve preferences across the federated login callback.
    sameSite: "none",
    secure: true,
    httpOnly,
  });
}

export async function readPrefs(
  identity?: PreferenceIdentity,
): Promise<SunrisePrefs> {
  const store = await cookies();
  const globalPrefs = parseCookie(store.get(PREFS_COOKIE)?.value);
  if (!identity) return { appearance: globalPrefs.appearance };

  const scopedPrefs = parseCookie(
    store.get(accountCookieName(identity))?.value,
  );
  return {
    appearance: globalPrefs.appearance,
    ...accountPrefs(scopedPrefs),
  };
}

export async function writePrefs(
  patch: Partial<SunrisePrefs>,
  identity?: PreferenceIdentity,
): Promise<void> {
  const scopedPatch = accountPatch(patch);
  if (Object.keys(scopedPatch).length > 0 && !identity) {
    throw new Error("Account preference writes require an OIDC identity");
  }

  const store = await cookies();
  const globalPrefs = parseCookie(store.get(PREFS_COOKIE)?.value);

  if (patch.appearance !== undefined) {
    globalPrefs.appearance = patch.appearance;
  }
  setPreferenceCookie(
    store,
    PREFS_COOKIE,
    JSON.stringify({ appearance: globalPrefs.appearance }),
    false,
  );

  if (Object.keys(scopedPatch).length === 0) return;
  if (!identity) return;

  const name = accountCookieName(identity);
  const current = accountPrefs(parseCookie(store.get(name)?.value));
  const next = { ...current, ...scopedPatch };
  setPreferenceCookie(store, name, serializeAccountPrefs(next), true);
}
