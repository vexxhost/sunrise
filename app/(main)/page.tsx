import { Suspense } from "react";
import { OverviewDashboard } from "@/components/overview/OverviewDashboard";
import { OverviewRefreshButton } from "@/components/overview/OverviewRefreshButton";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { ProjectContextHeader } from "@/components/overview/ProjectContextHeader";
import { loadCloudContext } from "@/lib/cloud-context";
import { loadOperationalFeed } from "@/lib/openstack/operational-feed";
import { compileOperationalFeed } from "@/lib/openstack/operational";
import { loadProjectOverview } from "@/lib/openstack/overview";
import { listClustersAction } from "@/lib/openstack/magnum";
import { filterResourcePreferencesByLiveIds } from "@/lib/resource-preferences";

async function OverviewData() {
  const cloud = await loadCloudContext();
  const { snapshot } = cloud;
  const regionId = snapshot.region.id ?? undefined;
  const projectId = snapshot.project.id ?? undefined;
  const [services, resourceFeed, clustersResult] = await Promise.all([
    loadProjectOverview({
      token: cloud.keystoneToken,
      regionId,
      projectId,
      catalog: cloud.catalog,
    }),
    loadOperationalFeed({
      token: cloud.keystoneToken,
      regionId,
      projectId,
      catalog: cloud.catalog,
    }),
    listClustersAction({}, regionId, projectId)
      .then((clusters) => ({ ok: true as const, clusters }))
      .catch(() => ({ ok: false as const, clusters: [] })),
  ]);
  const operationalFeed = compileOperationalFeed({
    services,
    resourceFeed,
    credentialExpiration: snapshot.role.credentialExpiration ?? undefined,
  });
  const pinnedResources = clustersResult.ok
    ? filterResourcePreferencesByLiveIds(
        snapshot.personalResources.pinned,
        "cluster",
        clustersResult.clusters.map(({ uuid }) => uuid),
      )
    : snapshot.personalResources.pinned;
  const recentResources = clustersResult.ok
    ? filterResourcePreferencesByLiveIds(
        snapshot.personalResources.recent,
        "cluster",
        clustersResult.clusters.map(({ uuid }) => uuid),
      )
    : snapshot.personalResources.recent;

  return (
    <OverviewDashboard
      services={services}
      operationalFeed={operationalFeed}
      serviceDirectory={snapshot.services}
      pinnedResources={pinnedResources}
      recentResources={recentResources}
    />
  );
}

export default async function Page() {
  const cloud = await loadCloudContext();
  const { snapshot } = cloud;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-9 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <ProjectContextHeader
        title="Overview"
        context={snapshot}
        actions={<OverviewRefreshButton />}
      />

      <Suspense
        key={`${snapshot.project.id ?? "none"}:${snapshot.region.id ?? "none"}`}
        fallback={<OverviewSkeleton />}
      >
        <OverviewData />
      </Suspense>
    </div>
  );
}
