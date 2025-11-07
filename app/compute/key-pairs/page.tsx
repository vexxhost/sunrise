import { getSession } from '@/lib/session';
import { KeypairsTable } from './KeypairsTable';
import { keypairsQueryOptions } from '@/hooks/queries/useServers';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="key pair"
      queries={[
        keypairsQueryOptions(session.regionId, session.projectId)
      ]}
    >
      <KeypairsTable regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
