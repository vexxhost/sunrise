import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import { shareNetworksQueryOptions } from "@/hooks/queries/useManila";
import { getSession } from "@/lib/session";
import { ShareNetworksClient } from "./ShareNetworksClient";

export default async function ShareNetworksPage() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="share network"
      queries={[shareNetworksQueryOptions(session.regionId, session.projectId)]}
    >
      <ShareNetworksClient
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </DataTableHydrationBoundary>
  );
}
