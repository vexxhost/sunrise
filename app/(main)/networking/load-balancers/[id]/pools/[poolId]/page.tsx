import { notFound } from "next/navigation";

import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { loadBalancerPoolDetailsQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { loadCloudContext } from "@/lib/cloud-context";
import { isOpenStackNotFoundError } from "@/lib/openstack/request";
import { makeQueryClient } from "@/lib/query-client";
import { PoolDetailClient } from "./PoolDetailClient";

export default async function PoolPage({
  params,
}: {
  params: Promise<{ id: string; poolId: string }>;
}) {
  const { id, poolId } = await params;
  const loadBalancerId = id.toLowerCase();
  const normalizedPoolId = poolId.toLowerCase();
  const { snapshot } = await loadCloudContext();
  const regionId = snapshot.region.id;
  const projectId = snapshot.project.id;
  if (!regionId || !projectId) return null;

  const queryClient = makeQueryClient();
  const query = loadBalancerPoolDetailsQueryOptions(
    regionId,
    projectId,
    loadBalancerId,
    normalizedPoolId,
  );
  try {
    await queryClient.fetchQuery(query);
  } catch (error) {
    if (isOpenStackNotFoundError(error)) notFound();
    throw error;
  }

  return (
    <PrefetchHydrationBoundary queries={[query]} queryClient={queryClient}>
      <PoolDetailClient
        loadBalancerId={loadBalancerId}
        poolId={normalizedPoolId}
        projectId={projectId}
        regionId={regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
