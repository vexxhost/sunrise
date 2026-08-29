import "server-only";

import { readPrefs } from "@/lib/prefs";
import {
  visibleResourcePreferences,
  type ResourcePreference,
} from "@/lib/resource-preferences";
import { getSession } from "@/lib/session";

export type ServiceLandingContext = {
  session: Awaited<ReturnType<typeof getSession>>;
  projectName: string;
  regionName: string;
  resources: ResourcePreference[];
};

export async function loadServiceLandingContext(): Promise<ServiceLandingContext> {
  const [session, prefs] = await Promise.all([getSession(), readPrefs()]);
  const projectName =
    prefs.projectId === session.projectId && prefs.projectName
      ? prefs.projectName
      : (session.projectId ?? "No project selected");
  const regionName = session.regionId ?? "No region selected";
  const visibleResources = visibleResourcePreferences({
    recent: prefs.recentResources ?? [],
    pinned: prefs.pinnedResources ?? [],
    context: {
      projectId: session.projectId ?? "",
      regionId: session.regionId ?? "",
    },
  });

  return {
    session,
    projectName,
    regionName,
    resources: [...visibleResources.pinned, ...visibleResources.recent],
  };
}
