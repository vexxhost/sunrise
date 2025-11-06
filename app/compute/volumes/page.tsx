import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { VolumesClient } from './VolumesClient';

export default async function Page() {
  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  return <VolumesClient regionId={regionId} projectId={projectId} />;
}
