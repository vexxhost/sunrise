import { getSession } from "@/lib/session";
import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { clusterTemplatesQueryOptions, clustersQueryOptions } from "@/hooks/queries/useMagnum";
import { ClustersClient } from "./ClustersClient";

export default async function ClustersPage() {
  const session = await getSession();

  return (
    <PrefetchHydrationBoundary
      queries={[
        clustersQueryOptions(session.regionId, session.projectId),
        clusterTemplatesQueryOptions(session.regionId, session.projectId),
      ]}
      fallback={
        <div className="rounded-md border border-dashed border-primary/40 py-16 text-center text-sm text-muted-foreground">
          Loading Magnum clusters...
        </div>
      }
    >
      <ClustersClient regionId={session.regionId} projectId={session.projectId} />
    </PrefetchHydrationBoundary>
  );
}

