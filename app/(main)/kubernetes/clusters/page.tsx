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
import { isCreateActionRequested } from "@/lib/create-actions";

export default async function ClustersPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    "cluster",
  );

  return (
    <DataTableHydrationBoundary
      resourceName="cluster"
      actions={
        <ClusterActions
          key={createRequested ? "create" : "idle"}
          regionId={session.regionId}
          projectId={session.projectId}
          initiallyOpen={createRequested}
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
