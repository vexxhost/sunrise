import { getSession } from '@/lib/session';
import { SnapshotsClient } from './SnapshotsClient';
import { snapshotsQueryOptions } from '@/hooks/queries/useVolumes';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { SnapshotActions } from '@/components/Volume/SnapshotActions';
import { isCreateActionRequested } from '@/lib/create-actions';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    'snapshot',
  );

  return (
    <DataTableHydrationBoundary
      resourceName="snapshot"
      actions={
        <SnapshotActions
          key={createRequested ? 'create' : 'idle'}
          regionId={session.regionId}
          projectId={session.projectId}
          initiallyOpen={createRequested}
        />
      }
      queries={[snapshotsQueryOptions(session.regionId, session.projectId)]}
    >
      <SnapshotsClient
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </DataTableHydrationBoundary>
  );
}
