import { getSession } from "@/lib/session";
import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import {
  clusterTemplatesQueryOptions,
  clustersQueryOptions,
} from "@/hooks/queries/useMagnum";
import { ClustersClient } from "./ClustersClient";

export default async function ClustersPage() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="cluster"
      queries={[
        clustersQueryOptions(session.regionId, session.projectId),
        clusterTemplatesQueryOptions(session.regionId, session.projectId),
      ]}
    >
      <ClustersClient
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </DataTableHydrationBoundary>
  );
}
