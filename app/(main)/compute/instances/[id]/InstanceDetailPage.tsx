import { getSession } from '@/lib/session';
import { InstanceDetailClient } from './InstanceDetailClient';
import { PrefetchHydrationBoundary } from '@/components/PrefetchHydrationBoundary';
import {
  serverQueryOptions,
  serverInterfacesQueryOptions,
  serverActionsQueryOptions,
  serverConsoleOutputQueryOptions,
} from '@/hooks/queries/useServers';
import {
  networkQueryOptions,
  portQueryOptions,
  securityGroupsQueryOptions,
} from '@/hooks/queries/useNetworks';
import { volumeQueryOptions } from '@/hooks/queries/useVolumes';
import { imageQueryOptions } from '@/hooks/queries/useImages';
import { makeQueryClient } from '@/lib/query-client';
import type { InstanceDetailTab } from './tabs';

interface InstanceDetailPageProps {
  id: string;
  activeTab: InstanceDetailTab;
}

export async function InstanceDetailPage({ id, activeTab }: InstanceDetailPageProps) {
  const session = await getSession();
  const { regionId, projectId } = session;

  // Fetch the server first so we can prefetch its dependent queries on the server.
  const queryClient = makeQueryClient();
  const serverQuery = serverQueryOptions(regionId, projectId, id);
  const interfacesQuery = serverInterfacesQueryOptions(regionId, projectId, id);
  const server = await queryClient.fetchQuery(serverQuery);
  const interfaceAttachments = await queryClient.fetchQuery(interfacesQuery);

  const attachedVolumeIds =
    server['os-extended-volumes:volumes_attached']?.map(
      (volume: { id: string }) => volume.id,
    ) ?? [];
  const portIds = interfaceAttachments.map((attachment) => attachment.port_id);
  const ports = await Promise.all(
    portIds.map((portId) =>
      queryClient.fetchQuery(portQueryOptions(regionId, projectId, portId)),
    ),
  );
  const networkIds = Array.from(
    new Set(ports.map((port) => port.network_id).filter(Boolean)),
  );

  const queries: Array<any> = [
    serverQuery,
    interfacesQuery,
    securityGroupsQueryOptions(regionId, projectId),
    serverActionsQueryOptions(regionId, projectId, id) as any,
    ...portIds.map((portId) => portQueryOptions(regionId, projectId, portId)),
    ...networkIds.map((networkId) =>
      networkQueryOptions(regionId, projectId, networkId),
    ),
  ];

  for (const volumeId of attachedVolumeIds) {
    queries.push(volumeQueryOptions(regionId, projectId, volumeId) as any);
  }

  if (server.image && typeof server.image === 'object' && server.image.id) {
    queries.push(imageQueryOptions(regionId, projectId, server.image.id) as any);
  }

  if (activeTab === 'log') {
    queries.push(serverConsoleOutputQueryOptions(regionId, projectId, id, 35) as any);
  }

  return (
    <PrefetchHydrationBoundary queries={queries} queryClient={queryClient}>
      <InstanceDetailClient
        serverId={id}
        regionId={regionId}
        projectId={projectId}
        activeTab={activeTab}
      />
    </PrefetchHydrationBoundary>
  );
}
