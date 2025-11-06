import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { NetworksClient } from './NetworksClient';

export default async function Page() {
  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  return <NetworksClient regionId={regionId} projectId={projectId} />;
}
