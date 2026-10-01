import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { shareSnapshotQueryOptions } from "@/hooks/queries/useManila";
import { makeQueryClient } from "@/lib/query-client";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";
import { getSession } from "@/lib/session";
import { ShareSnapshotDetailClient } from "./ShareSnapshotDetailClient";

export default async function ShareSnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const snapshotQuery = shareSnapshotQueryOptions(
    session.regionId,
    session.projectId,
    id,
  );

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(snapshotQuery), {
    kind: "share-snapshot",
    id,
  });

  return (
    <PrefetchHydrationBoundary
      queries={[snapshotQuery]}
      queryClient={queryClient}
    >
      <ShareSnapshotDetailClient
        snapshotId={id}
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </PrefetchHydrationBoundary>
  );
}
