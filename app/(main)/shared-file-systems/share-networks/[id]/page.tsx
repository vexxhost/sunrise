import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { shareNetworkQueryOptions } from "@/hooks/queries/useManila";
import { makeQueryClient } from "@/lib/query-client";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { getSession } from "@/lib/session";
import { ShareNetworkDetailClient } from "./ShareNetworkDetailClient";

export default async function ShareNetworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const networkQuery = shareNetworkQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(networkQuery), {
    kind: "share-network",
    id,
  });

  return (
    <PrefetchHydrationBoundary
      queries={[networkQuery]}
      queryClient={queryClient}
    >
      <ShareNetworkDetailClient
        networkId={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
