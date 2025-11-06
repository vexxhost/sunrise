import { getSession } from '@/lib/session';
import { VolumesClient } from './VolumesClient';

export default async function Page() {
  const session = await getSession();

  return <VolumesClient regionId={session.regionId} projectId={session.projectId} />;
}
