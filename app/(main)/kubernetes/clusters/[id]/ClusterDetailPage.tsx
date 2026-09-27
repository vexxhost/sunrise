import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import {
  clusterNodeGroupsQueryOptions,
  clusterQueryOptions,
  clusterTemplatesQueryOptions,
} from "@/hooks/queries/useMagnum";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { ClusterDetailClient } from "./ClusterDetailClient";
import type { KubernetesClusterDetailTab } from "./tabs";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";

interface ClusterDetailPageProps {
  id: string;
  activeTab: KubernetesClusterDetailTab;
}

export async function ClusterDetailPage({
  id,
  activeTab,
}: ClusterDetailPageProps) {
  const session = await getSession();
  const queryClient = makeQueryClient();
  const clusterQuery = clusterQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  const nodeGroupsQuery = clusterNodeGroupsQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );
  const templatesQuery = clusterTemplatesQueryOptions(
    session.regionId,
    session.projectId,
  );

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(clusterQuery), {
    kind: "cluster",
    id,
  });
  await Promise.all([
    queryClient.prefetchQuery(nodeGroupsQuery),
    queryClient.prefetchQuery(templatesQuery),
  ]);

  return (
    <PrefetchHydrationBoundary
      queries={[clusterQuery, nodeGroupsQuery, templatesQuery]}
      queryClient={queryClient}
    >
      <ClusterDetailClient
        clusterId={id}
        regionId={session.regionId}
        projectId={session.projectId}
        activeTab={activeTab}
      />
    </PrefetchHydrationBoundary>
  );
}
