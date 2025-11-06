import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { InstancesClient } from './InstancesClient';

export default async function Page() {
  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  return <InstancesClient regionId={regionId} projectId={projectId} />;
}
