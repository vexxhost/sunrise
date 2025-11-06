import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { InstanceDetailClient } from './InstanceDetailClient';

interface Params {
  id: string;
}

export default async function Instance({ params }: { params: Params }) {
  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  return <InstanceDetailClient serverId={params.id} regionId={regionId} projectId={projectId} />;
}
