import { getSession } from "@/lib/session";
import { makeQueryClient } from "@/lib/query-client";
import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { volumeQueryOptions } from "@/hooks/queries/useVolumes";
import { VolumeDetailClient } from "./VolumeDetailClient";
import { fetchOpenStackResourceOrRecover } from "@/lib/resource-recovery-server";

interface VolumePageProps {
  params: Promise<{ id: string }>;
}

export default async function VolumePage({ params }: VolumePageProps) {
  const { id } = await params;
  const session = await getSession();
  const queryClient = makeQueryClient();
  const volumeQuery = volumeQueryOptions(session.regionId, session.projectId, id);

  await fetchOpenStackResourceOrRecover(queryClient.fetchQuery(volumeQuery), {
    kind: "volume",
    id,
  });

  return (
    <PrefetchHydrationBoundary queries={[volumeQuery]} queryClient={queryClient}>
      <VolumeDetailClient
        volumeId={id}
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </PrefetchHydrationBoundary>
  );
}
