import { getSession } from '@/lib/session';
import { VolumesClient } from './VolumesClient';
import { volumesQueryOptions } from '@/hooks/queries/useVolumes';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="volume"
      queries={[
        volumesQueryOptions(session.regionId, session.projectId)
      ]}
    >
      <VolumesClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
