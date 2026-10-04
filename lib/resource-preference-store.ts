import "server-only";

import { readPrefs, writePrefs } from "@/lib/prefs";
import { preferenceIdentityFromSession } from "@/lib/preference-identity";
import { getSession } from "@/lib/session";
import {
  normalizeResourceProjectId,
  removeResourcePreference,
  type ResourceKind,
  type ResourcePreferenceContext,
} from "@/lib/resource-preferences";

export type SavedResourceTarget = {
  kind: ResourceKind;
  id: string;
};

export async function removeSavedResourcePreferences(
  targets: readonly SavedResourceTarget[],
  context: ResourcePreferenceContext,
): Promise<number> {
  const projectId = normalizeResourceProjectId(context.projectId);
  const regionId = context.regionId.trim();
  const normalizedTargets = targets.flatMap((target) => {
    const id = target.id.trim();
    return id ? [{ ...target, id }] : [];
  });
  if (!projectId || !regionId || normalizedTargets.length === 0) return 0;

  const session = await getSession();
  const preferenceIdentity = preferenceIdentityFromSession(session);
  if (!preferenceIdentity) return 0;

  const prefs = await readPrefs(preferenceIdentity);
  const currentRecent = prefs.recentResources ?? [];
  const currentPinned = prefs.pinnedResources ?? [];
  let recentResources = currentRecent;
  let pinnedResources = currentPinned;

  for (const target of normalizedTargets) {
    const preferenceTarget = { ...target, projectId, regionId };
    recentResources = removeResourcePreference(
      recentResources,
      preferenceTarget,
    );
    pinnedResources = removeResourcePreference(
      pinnedResources,
      preferenceTarget,
    );
  }

  const removed =
    currentRecent.length +
    currentPinned.length -
    recentResources.length -
    pinnedResources.length;
  if (removed > 0) {
    await writePrefs({ recentResources, pinnedResources }, preferenceIdentity);
  }

  return removed;
}
