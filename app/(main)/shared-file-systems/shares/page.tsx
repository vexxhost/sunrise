import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import { ShareActions } from "@/components/SharedFileSystem/ShareActions";
import { sharesQueryOptions } from "@/hooks/queries/useManila";
import { isCreateActionRequested } from "@/lib/create-actions";
import { getSession } from "@/lib/session";
import { SharesClient } from "./SharesClient";

export default async function SharesPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    "share",
  );

  return (
    <DataTableHydrationBoundary
      resourceName="share"
      actions={
        <ShareActions
          key={createRequested ? "create" : "idle"}
          initiallyOpen={createRequested}
          projectId={session.projectId}
          regionId={session.regionId}
        />
      }
      queries={[sharesQueryOptions(session.regionId, session.projectId)]}
    >
      <SharesClient projectId={session.projectId} regionId={session.regionId} />
    </DataTableHydrationBoundary>
  );
}
