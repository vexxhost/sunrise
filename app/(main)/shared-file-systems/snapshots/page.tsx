import { DataTableHydrationBoundary } from "@/components/DataTable/HydrationBoundary";
import { ShareSnapshotActions } from "@/components/SharedFileSystem/ShareSnapshotActions";
import { shareSnapshotsQueryOptions } from "@/hooks/queries/useManila";
import { isCreateActionRequested } from "@/lib/create-actions";
import { getSession } from "@/lib/session";
import { ShareSnapshotsClient } from "./ShareSnapshotsClient";

export default async function ShareSnapshotsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    "share-snapshot",
  );

  return (
    <DataTableHydrationBoundary
      resourceName="share snapshot"
      actions={
        <ShareSnapshotActions
          key={createRequested ? "create" : "idle"}
          initiallyOpen={createRequested}
          projectId={session.projectId}
          regionId={session.regionId}
        />
      }
      queries={[
        shareSnapshotsQueryOptions(session.regionId, session.projectId),
      ]}
    >
      <ShareSnapshotsClient
        projectId={session.projectId}
        regionId={session.regionId}
      />
    </DataTableHydrationBoundary>
  );
}
