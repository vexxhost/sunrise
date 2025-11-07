import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { keypairsQueryOptions } from '@/hooks/queries/useServers';
import { getSession } from '@/lib/session';
import { KeypairsTable } from './KeypairsTable';
import { Actions } from './actions';
import { RESOURCE_NAME } from './constants';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName={RESOURCE_NAME}
      actions={<Actions />}
      queries={[
        keypairsQueryOptions(session.regionId, session.projectId)
      ]}
    >
      <KeypairsTable regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
