import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { snapshotQueryOptions } from "@/hooks/queries/useVolumes";
import { makeQueryClient } from "@/lib/query-client";
import { getSession } from "@/lib/session";
import { SnapshotDetailClient } from "./SnapshotDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";

interface SnapshotPageProps {
  params: Promise<{ id: string }>;
}

export default async function SnapshotPage({ params }: SnapshotPageProps) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const query = snapshotQueryOptions(session.regionId, session.projectId, id);

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(query), {
    kind: "snapshot",
    id,
  });

  return (
    <PrefetchHydrationBoundary queries={[query]} queryClient={queryClient}>
      <SnapshotDetailClient
        snapshotId={id}
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </PrefetchHydrationBoundary>
  );
}
