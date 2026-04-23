import { getSession } from '@/lib/session';
import { InstanceDetailClient } from './InstanceDetailClient';
import { PrefetchHydrationBoundary } from '@/components/PrefetchHydrationBoundary';
import {
  serverQueryOptions,
  serverInterfacesQueryOptions,
  serverActionsQueryOptions,
} from '@/hooks/queries/useServers';
import { securityGroupsQueryOptions } from '@/hooks/queries/useNetworks';
import { volumeQueryOptions } from '@/hooks/queries/useVolumes';
import { imageQueryOptions } from '@/hooks/queries/useImages';
import { makeQueryClient } from '@/lib/query-client';

interface Params {
  id: string;
}

export default async function Instance({ params }: { params: Promise<Params> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const { regionId, projectId } = session;

  // Fetch the server first so we can prefetch its dependent queries on the server.
  const queryClient = makeQueryClient();
  const server = await queryClient.fetchQuery(
    serverQueryOptions(regionId, projectId, id),
  );

  const attachedVolumeIds =
    server['os-extended-volumes:volumes_attached']?.map(
      (volume: { id: string }) => volume.id,
    ) ?? [];

  const queries: Array<ReturnType<typeof serverQueryOptions>> = [
    serverQueryOptions(regionId, projectId, id),
    serverInterfacesQueryOptions(regionId, projectId, id),
    securityGroupsQueryOptions(regionId, projectId),
    serverActionsQueryOptions(regionId, projectId, id) as any,
  ];

  for (const volumeId of attachedVolumeIds) {
    queries.push(volumeQueryOptions(regionId, projectId, volumeId) as any);
  }

  if (server.image && typeof server.image === 'object' && server.image.id) {
    queries.push(imageQueryOptions(regionId, projectId, server.image.id) as any);
  }

  return (
    <PrefetchHydrationBoundary queries={queries}>
      <InstanceDetailClient serverId={id} regionId={regionId} projectId={projectId} />
    </PrefetchHydrationBoundary>
  );
}
