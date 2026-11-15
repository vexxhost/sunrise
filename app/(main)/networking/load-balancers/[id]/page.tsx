import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { loadBalancerDetailsQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { loadCloudContext } from "@/lib/cloud-context";
import { makeQueryClient } from "@/lib/query-client";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { LoadBalancerDetailClient } from "./LoadBalancerDetailClient";

export default async function LoadBalancerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { snapshot } = await loadCloudContext();
  const regionId = snapshot.region.id ?? undefined;
  const projectId = snapshot.project.id ?? undefined;
  const neutronAvailable = snapshot.destinations.some(
    ({ id: destinationId, status }) =>
      destinationId === "networking.networks" && status !== "unavailable",
  );
  const queryClient = makeQueryClient();
  const query = loadBalancerDetailsQueryOptions(regionId, projectId, id);

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(query), {
    kind: "load-balancer",
    id,
  });

  return (
    <PrefetchHydrationBoundary queries={[query]} queryClient={queryClient}>
      <LoadBalancerDetailClient
        id={id}
        neutronAvailable={neutronAvailable}
        projectId={projectId}
        regionId={regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
