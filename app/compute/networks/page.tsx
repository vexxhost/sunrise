import { getSession } from '@/lib/session';
import { NetworksClient } from './NetworksClient';
import { networksQueryOptions } from '@/hooks/queries/useNetworks';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      queries={[
        networksQueryOptions(session.regionId, session.projectId)
      ]}
    >
      <NetworksClient regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
