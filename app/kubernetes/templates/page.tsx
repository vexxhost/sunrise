import { getSession } from "@/lib/session";
import { PrefetchHydrationBoundary } from "@/components/PrefetchHydrationBoundary";
import { TemplatesClient } from "./TemplatesClient";
import { clusterTemplatesQueryOptions } from "@/hooks/queries/useMagnum";

export default async function ClusterTemplatesPage() {
  const session = await getSession();

  return (
    <PrefetchHydrationBoundary
      queries={[clusterTemplatesQueryOptions(session.regionId, session.projectId)]}
      fallback={
        <div className="rounded-md border border-dashed border-primary/40 py-16 text-center text-sm text-muted-foreground">
          Loading cluster templates...
        </div>
      }
    >
      <TemplatesClient regionId={session.regionId} projectId={session.projectId} />
    </PrefetchHydrationBoundary>
  );
}

