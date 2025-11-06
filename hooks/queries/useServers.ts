/**
 * TanStack Query options for Nova (Compute) API
 */

import { queryOptions } from '@tanstack/react-query';
import { openstack } from '@/lib/openstack/actions';
import type { ServerListResponse, ServerResponse, FlavorListResponse, FlavorResponse, KeypairListResponse, KeypairResponse, InterfaceAttachment } from '@/types/openstack';

/**
 * Query options for fetching list of servers
 */
export function serversQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'servers'],
    queryFn: async () => {
      const data = await openstack<ServerListResponse>({
        regionId: regionId!,
        serviceType: 'compute',
        serviceName: 'nova',
        path: '/servers/detail',
        apiVersion: 'compute 2.79',
      });

      if (!data) {
        return [];
      }

      return data.servers;
    },
    enabled: !!regionId,
  });
}

/**
 * Query options for fetching a single server by ID
 */
export function serverQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'server', id],
    queryFn: async () => {
      const data = await openstack<ServerResponse>({
        regionId: regionId!,
        serviceType: 'compute',
        serviceName: 'nova',
        path: `/servers/${id}`,
        apiVersion: 'compute 2.79',
      });

      if (!data) {
        throw new Error('Server not found');
      }

      return data.server;
    },
    enabled: !!id && !!regionId,
  });
}

/**
 * Query options for fetching list of flavors
 */
export function flavorsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'flavors'],
    queryFn: async () => {
      const data = await openstack<FlavorListResponse>({
        regionId: regionId!,
        serviceType: 'compute',
        serviceName: 'nova',
        path: '/flavors/detail',
        apiVersion: 'compute 2.79',
      });

      if (!data) {
        return [];
      }

      return data.flavors;
    },
    enabled: !!regionId,
  });
}

/**
 * Query options for fetching a single flavor by ID
 */
export function flavorQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'flavor', id],
    queryFn: async () => {
      const data = await openstack<FlavorResponse>({
        regionId: regionId!,
        serviceType: 'compute',
        serviceName: 'nova',
        path: `/flavors/${id}`,
        apiVersion: 'compute 2.79',
      });

      if (!data) {
        throw new Error('Flavor not found');
      }

      return data.flavor;
    },
    enabled: !!id && !!regionId,
  });
}

/**
 * Query options for fetching server interface attachments
 */
export function serverInterfacesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  serverId: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'server-interfaces', serverId],
    queryFn: async () => {
      const data = await openstack<{ interfaceAttachments: InterfaceAttachment[] }>({
        regionId: regionId!,
        serviceType: 'compute',
        serviceName: 'nova',
        path: `/servers/${serverId}/os-interface`,
        apiVersion: 'compute 2.79',
      });

      if (!data) {
        return [];
      }

      return data.interfaceAttachments;
    },
    enabled: !!serverId && !!regionId,
  });
}

/**
 * Query options for fetching list of keypairs
 */
export function keypairsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'keypairs'],
    queryFn: async () => {
      const data = await openstack<KeypairListResponse>({
        regionId: regionId!,
        serviceType: 'compute',
        serviceName: 'nova',
        path: '/os-keypairs',
        apiVersion: 'compute 2.79',
      });

      if (!data) {
        return [];
      }

      return data.keypairs.map(item => item.keypair);
    },
    enabled: !!regionId,
  });
}

/**
 * Query options for fetching a single keypair by name
 */
export function keypairQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  name: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'keypair', name],
    queryFn: async () => {
      const data = await openstack<KeypairResponse>({
        regionId: regionId!,
        serviceType: 'compute',
        serviceName: 'nova',
        path: `/os-keypairs/${name}`,
        apiVersion: 'compute 2.79',
      });

      if (!data) {
        throw new Error('Keypair not found');
      }

      return data.keypair;
    },
    enabled: !!name && !!regionId,
  });
}

