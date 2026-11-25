import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { loadBalancerDetailsQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { loadCloudContext } from "@/lib/cloud-context";
import { microversionSupport } from "@/lib/openstack/capabilities";
import {
  discoverLoadBalancerCapabilities,
  OCTAVIA_TAGS_MICROVERSION,
} from "@/lib/openstack/capabilities-server";
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
  if (!regionId || !projectId) return null;
  const neutronAvailable = snapshot.destinations.some(
    ({ id: destinationId, status }) =>
      destinationId === "networking.networks" && status !== "unavailable",
  );
  const capabilities = await discoverLoadBalancerCapabilities(regionId);
  const tagSupport = microversionSupport(
    capabilities,
    OCTAVIA_TAGS_MICROVERSION,
    "Load balancer tags",
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
        tagSupport={tagSupport}
      />
    </PrefetchHydrationBoundary>
  );
}
