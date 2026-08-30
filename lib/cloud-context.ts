import "server-only";

import { cache } from "react";
import {
  buildCloudContextSnapshot,
  type CloudContextSnapshot,
} from "@/lib/cloud-context-snapshot";
import { getProjects, getRegions } from "@/lib/keystone/queries";
import {
  getServiceCatalog,
  type OpenStackCatalogService,
} from "@/lib/openstack/catalog";
import { getUserInfo } from "@/lib/openstack/keystone-actions";
import { readPrefs } from "@/lib/prefs";
import { getSession } from "@/lib/session";
import type { SunriseAppearance } from "@/lib/theme-preference";

export type CloudContext = {
  keystoneToken?: string;
  catalog: OpenStackCatalogService[] | null;
  appearance: SunriseAppearance;
  snapshot: CloudContextSnapshot;
};

export const loadCloudContext = cache(async (): Promise<CloudContext> => {
  // Keep the established initialization order: these helpers can establish
  // project and region defaults for an authenticated session.
  const regions = await getRegions();
  const projects = await getProjects();
  const session = await getSession();
  const [prefs, userInfo, catalog] = await Promise.all([
    readPrefs(),
    getUserInfo(),
    session.keystoneProjectToken
      ? getServiceCatalog(session.keystoneProjectToken)
      : Promise.resolve(null),
  ]);

  return {
    keystoneToken: session.keystoneProjectToken,
    catalog,
    appearance: prefs.appearance ?? "system",
    snapshot: buildCloudContextSnapshot({
      session,
      prefs,
      projects,
      regions,
      userName: userInfo?.name,
      catalog,
    }),
  };
});
