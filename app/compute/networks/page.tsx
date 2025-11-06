import { getSession } from '@/lib/session';
import { NetworksClient } from './NetworksClient';

export default async function Page() {
  const session = await getSession();

  return <NetworksClient regionId={session.regionId} projectId={session.projectId} />;
}
