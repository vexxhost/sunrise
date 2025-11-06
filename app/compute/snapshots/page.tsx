import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { SnapshotsClient } from './SnapshotsClient';

export default async function Page() {
  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  return <SnapshotsClient regionId={regionId} projectId={projectId} />;
}
