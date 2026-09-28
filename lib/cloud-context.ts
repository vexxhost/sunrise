import "server-only";

import { cache } from "react";
import { takeCloudContextBootstrap } from "@/lib/cloud-context-bootstrap";
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

export async function loadCloudContextUncached(): Promise<CloudContext> {
  const session = await getSession();
  const bootstrap = takeCloudContextBootstrap(session.cloudContextBootstrapId);
  const knownUserName =
    bootstrap?.userName ??
    session.oidcIdentity?.preferredUsername ??
    session.oidcIdentity?.displayName;
  const [prefs, projects, regions, userInfo, catalog] = await Promise.all([
    readPrefs(),
    bootstrap
      ? Promise.resolve(
          [...bootstrap.projects].sort((a, b) => a.name.localeCompare(b.name)),
        )
      : getProjects(),
    bootstrap
      ? Promise.resolve(
          [...bootstrap.regions].sort((a, b) => a.id.localeCompare(b.id)),
        )
      : getRegions(),
    knownUserName ? Promise.resolve(null) : getUserInfo(),
    bootstrap?.catalog
      ? Promise.resolve(bootstrap.catalog)
      : session.keystoneProjectToken
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
      userName: knownUserName ?? userInfo?.name,
      catalog,
    }),
  };
}

export const loadCloudContext = cache(loadCloudContextUncached);
