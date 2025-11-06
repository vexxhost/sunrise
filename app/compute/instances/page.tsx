import { getSession } from '@/lib/session';
import { InstancesClient } from './InstancesClient';

export default async function Page() {
  const session = await getSession();

  return <InstancesClient regionId={session.regionId} projectId={session.projectId} />;
}
