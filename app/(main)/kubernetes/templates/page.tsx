import { getSession } from "@/lib/session";
import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import { clusterTemplatesQueryOptions } from "@/hooks/queries/useMagnum";
import { TemplatesClient } from "./TemplatesClient";

export default async function ClusterTemplatesPage() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="cluster template"
      queries={[
        clusterTemplatesQueryOptions(session.regionId, session.projectId),
      ]}
    >
      <TemplatesClient
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </DataTableHydrationBoundary>
  );
}
