import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import {
  clusterEventsQueryOptions,
  clusterQueryOptions,
  clusterTemplatesQueryOptions,
} from "@/hooks/queries/useMagnum";
import { ClusterDetailClient } from "./ClusterDetailClient";

export default async function ClusterDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const session = await getSession();

  try {
    return (
      <PrefetchHydrationBoundary
        queries={[
          clusterQueryOptions(session.regionId, session.projectId, id),
          clusterEventsQueryOptions(session.regionId, session.projectId, id),
          clusterTemplatesQueryOptions(session.regionId, session.projectId),
        ]}
        fallback={
          <div className="rounded-md border border-dashed border-primary/40 py-16 text-center text-sm text-muted-foreground">
            Loading cluster details...
          </div>
        }
      >
        <ClusterDetailClient regionId={session.regionId} projectId={session.projectId} clusterId={id} />
      </PrefetchHydrationBoundary>
    );
  } catch {
    return notFound();
  }
}

