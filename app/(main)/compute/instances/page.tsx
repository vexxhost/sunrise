import { getSession } from '@/lib/session';
import { InstancesClient } from './InstancesClient';
import { flavorsQueryOptions, serversQueryOptions } from '@/hooks/queries/useServers';
import { volumesQueryOptions } from '@/hooks/queries/useVolumes';
import { imagesQueryOptions } from '@/hooks/queries/useImages';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { InstanceActions } from '@/components/Instance/InstanceActions';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="instance"
      actions={
        <InstanceActions
          regionId={session.regionId}
          projectId={session.projectId}
        />
      }
      queries={[
        serversQueryOptions(session.regionId, session.projectId),
        volumesQueryOptions(session.regionId, session.projectId),
        imagesQueryOptions(session.regionId, session.projectId),
        flavorsQueryOptions(session.regionId, session.projectId),
      ]}
    >
      <InstancesClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
