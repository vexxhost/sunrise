import { getSession } from '@/lib/session';
import { VolumeDetailClient } from './VolumeDetailClient';

interface Params {
  id: string;
}

export default async function VolumePage({ params }: { params: Params }) {
  const session = await getSession();

  return (
    <VolumeDetailClient
      volumeId={params.id}
      regionId={session.regionId}
      projectId={session.projectId}
    />
  );
}

