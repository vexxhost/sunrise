import { getSession } from "@/lib/session";
import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import {
  clusterTemplatesQueryOptions,
  clustersQueryOptions,
} from "@/hooks/queries/useMagnum";
import { ClustersClient } from "./ClustersClient";
import { ClusterActions } from "@/components/Kubernetes/ClusterActions";
import {
  flavorsQueryOptions,
  keypairsQueryOptions,
} from "@/hooks/queries/useServers";

export default async function ClustersPage() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="cluster"
      actions={
        <ClusterActions
          regionId={session.regionId}
          projectId={session.projectId}
        />
      }
      queries={[
        clustersQueryOptions(session.regionId, session.projectId),
        clusterTemplatesQueryOptions(session.regionId, session.projectId),
        flavorsQueryOptions(session.regionId, session.projectId),
        keypairsQueryOptions(session.regionId, session.projectId),
      ]}
    >
      <ClustersClient
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </DataTableHydrationBoundary>
  );
}
