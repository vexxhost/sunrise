import { getSession } from '@/lib/session';
import { VolumesClient } from './VolumesClient';
import { volumesQueryOptions } from '@/hooks/queries/useVolumes';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { VolumeActions } from '@/components/Volume/VolumeActions';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="volume"
      actions={
        <VolumeActions
          regionId={session.regionId}
          projectId={session.projectId}
        />
      }
      queries={[
        volumesQueryOptions(session.regionId, session.projectId)
      ]}
    >
      <VolumesClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
