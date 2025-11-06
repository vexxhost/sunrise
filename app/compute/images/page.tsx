import { getSession } from '@/lib/session';
import { ImagesClient } from './ImagesClient';

export default async function Page() {
  const session = await getSession();

  return <ImagesClient regionId={session.regionId} projectId={session.projectId} />;
}
