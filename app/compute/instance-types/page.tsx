import { getSession } from '@/lib/session';
import { InstanceTypesClient } from './InstanceTypesClient';
import { flavorsQueryOptions } from '@/hooks/queries/useServers';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      queries={[
        flavorsQueryOptions(session.regionId, session.projectId)
      ]}
    >
      <InstanceTypesClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
