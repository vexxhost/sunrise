import { getSession } from '@/lib/session';
import { VolumesClient } from './VolumesClient';
import { volumesQueryOptions } from '@/hooks/queries/useVolumes';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { VolumeActions } from '@/components/Volume/VolumeActions';
import { isCreateActionRequested } from '@/lib/create-actions';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    'volume',
  );

  return (
    <DataTableHydrationBoundary
      resourceName="volume"
      actions={
        <VolumeActions
          key={createRequested ? 'create' : 'idle'}
          regionId={session.regionId}
          projectId={session.projectId}
          initiallyOpen={createRequested}
        />
      }
      queries={[volumesQueryOptions(session.regionId, session.projectId)]}
    >
      <VolumesClient
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </DataTableHydrationBoundary>
  );
}
