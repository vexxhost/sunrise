import { getSession } from '@/lib/session';
import { SnapshotsClient } from './SnapshotsClient';
import { snapshotsQueryOptions } from '@/hooks/queries/useVolumes';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="snapshot"
      queries={[
        snapshotsQueryOptions(session.regionId, session.projectId)
      ]}
    >
      <SnapshotsClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
