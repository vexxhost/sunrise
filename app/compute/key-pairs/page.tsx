import { ActionButton } from '@/components/DataTable/ActionButton';
import { DataTableHydrationBoundary } from '@/components/DataTable/HydrationBoundary';
import { ButtonGroup } from '@/components/ui/button-group';
import { keypairsQueryOptions } from '@/hooks/queries/useServers';
import { getSession } from '@/lib/session';
import { Upload } from 'lucide-react';
import { KeypairsTable } from './KeypairsTable';
import { Actions } from './actions';

export default async function Page() {
  const session = await getSession();

  return (
    <DataTableHydrationBoundary
      resourceName="key pair"
      actions={<Actions />}
      queries={[
        keypairsQueryOptions(session.regionId, session.projectId)
      ]}
    >
      <KeypairsTable regionId={session.regionId} projectId={session.projectId} />
    </DataTableHydrationBoundary>
  );
}
