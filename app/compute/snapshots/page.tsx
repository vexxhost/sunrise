import { getSession } from '@/lib/session';
import { SnapshotsClient } from './SnapshotsClient';

export default async function Page() {
  const session = await getSession();

  return <SnapshotsClient regionId={session.regionId} projectId={session.projectId} />;
}
