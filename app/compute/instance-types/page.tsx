import { getSession } from '@/lib/session';
import { InstanceTypesClient } from './InstanceTypesClient';

export default async function Page() {
  const session = await getSession();

  return <InstanceTypesClient regionId={session.regionId} projectId={session.projectId} />;
}
