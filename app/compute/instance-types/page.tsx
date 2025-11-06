import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { InstanceTypesClient } from './InstanceTypesClient';

export default async function Page() {
  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  return <InstanceTypesClient regionId={regionId} projectId={projectId} />;
}
