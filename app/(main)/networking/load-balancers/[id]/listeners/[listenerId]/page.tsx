import { notFound } from "next/navigation";

import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { loadBalancerListenerDetailsQueryOptions } from "@/hooks/queries/useLoadBalancers";
import { loadCloudContext } from "@/lib/cloud-context";
import { isOpenStackNotFoundError } from "@/lib/openstack/request";
import { makeQueryClient } from "@/lib/query-client";
import { ListenerDetailClient } from "./ListenerDetailClient";

export default async function ListenerPage({
  params,
}: {
  params: Promise<{ id: string; listenerId: string }>;
}) {
  const { id, listenerId } = await params;
  const { snapshot } = await loadCloudContext();
  const regionId = snapshot.region.id;
  const projectId = snapshot.project.id;
  if (!regionId || !projectId) return null;

  const queryClient = makeQueryClient();
  const query = loadBalancerListenerDetailsQueryOptions(
    regionId,
    projectId,
    id.toLowerCase(),
    listenerId.toLowerCase(),
  );
  try {
    await queryClient.fetchQuery(query);
  } catch (error) {
    if (isOpenStackNotFoundError(error)) notFound();
    throw error;
  }

  return (
    <PrefetchHydrationBoundary queries={[query]} queryClient={queryClient}>
      <ListenerDetailClient
        loadBalancerId={id.toLowerCase()}
        listenerId={listenerId.toLowerCase()}
        projectId={projectId}
        regionId={regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
