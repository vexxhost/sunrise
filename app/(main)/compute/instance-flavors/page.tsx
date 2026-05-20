import { getSession } from '@/lib/session';
import { InstanceFlavorsClient } from './InstanceFlavorsClient';
import { flavorsQueryOptions } from '@/hooks/queries/useServers';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="instance flavor"
      queries={[
        flavorsQueryOptions(session.regionId, session.projectId)
      ]}
    >
      <InstanceFlavorsClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
