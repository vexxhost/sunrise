import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { keypairsQueryOptions } from '@/hooks/queries/useServers';
import { getSession } from '@/lib/session';
import { KeypairsTable } from './KeypairsTable';
import { RESOURCE_NAME } from './constants';
import { KeypairActions } from '@/components/Instance/KeypairActions';
import { isCreateActionRequested } from '@/lib/create-actions';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const session = await getSession();
  const createRequested = isCreateActionRequested(
    (await searchParams).create,
    'key-pair',
  );

  return (
    <DataTableHydrationBoundary
      resourceName={RESOURCE_NAME}
      actions={
        <KeypairActions
          key={createRequested ? 'create' : 'idle'}
          regionId={session.regionId}
          projectId={session.projectId}
          initiallyOpen={createRequested}
        />
      }
      queries={[keypairsQueryOptions(session.regionId, session.projectId)]}
    >
      <KeypairsTable
        regionId={session.regionId}
        projectId={session.projectId}
      />
    </DataTableHydrationBoundary>
  );
}
