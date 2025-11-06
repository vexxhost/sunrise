import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { ImagesClient } from './ImagesClient';

export default async function Page() {
  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  return <ImagesClient regionId={regionId} projectId={projectId} />;
}
