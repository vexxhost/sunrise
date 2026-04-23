import { getSession } from '@/lib/session';
import { InstanceDetailClient } from './InstanceDetailClient';

interface Params {
  id: string;
}

export default async function Instance({ params }: { params: Params }) {
  const session = await getSession();

  return <InstanceDetailClient serverId={params.id} regionId={session.regionId} projectId={session.projectId} />;
}
