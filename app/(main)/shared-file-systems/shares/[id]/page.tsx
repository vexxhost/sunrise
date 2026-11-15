import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import {
  shareNetworksQueryOptions,
  shareQueryOptions,
} from "@/hooks/queries/useManila";
import { makeQueryClient } from "@/lib/query-client";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { getSession } from "@/lib/session";
import { ShareDetailClient } from "./ShareDetailClient";

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const shareQuery = shareQueryOptions(session.regionId, session.projectId, id);
  const networksQuery = shareNetworksQueryOptions(
    session.regionId,
    session.projectId,
  );

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(shareQuery), {
    kind: "share",
    id,
  });

  return (
    <PrefetchHydrationBoundary
      queries={[shareQuery, networksQuery]}
      queryClient={queryClient}
    >
      <ShareDetailClient
        shareId={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
