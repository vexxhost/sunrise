/**
 * TanStack Query hooks for Nova (Compute) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import type { Server, Flavor, InterfaceAttachment } from '@/types/openstack';
import { useApiClient } from './useApiClient';

/**
 * Hook to fetch list of servers
 */
export function useServers() {
  const { region, projectId } = useKeystone();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region, projectId, 'servers'],
    queryFn: async () => {
      const data = await client!.get('servers/detail').json<{ servers: Server[] }>();
      return data.servers;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single server by ID
 */
export function useServer(id: string, options?: Omit<UseQueryOptions<Server>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region, projectId, 'server', id],
    queryFn: async () => {
      const data = await client!.get(`servers/${id}`).json<{ server: Server }>();
      return data.server;
    },
    enabled: !!id && !!client,
    ...options,
  });
}

/**
 * Hook to fetch list of flavors
 */
export function useFlavors() {
  const { region, projectId } = useKeystone();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region, projectId, 'flavors'],
    queryFn: async () => {
      const data = await client!.get('flavors/detail').json<{ flavors: Flavor[] }>();
      return data.flavors;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single flavor by ID
 */
export function useFlavor(id: string, options?: Omit<UseQueryOptions<Flavor>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region, projectId, 'flavor', id],
    queryFn: async () => {
      const data = await client!.get(`flavors/${id}`).json<{ flavor: Flavor }>();
      return data.flavor;
    },
    enabled: !!id && !!client,
    ...options,
  });
}

/**
 * Hook to fetch server interface attachments
 */
export function useServerInterfaces(serverId: string, options?: Omit<UseQueryOptions<InterfaceAttachment[]>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region, projectId, 'server-interfaces', serverId],
    queryFn: async () => {
      const data = await client!.get(`servers/${serverId}/os-interface`).json<{ interfaceAttachments: InterfaceAttachment[] }>();
      return data.interfaceAttachments;
    },
    enabled: !!serverId && !!client,
    ...options,
  });
}
