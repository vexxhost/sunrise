/**
 * TanStack Query hooks for Nova (Compute) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import { apiUrl } from '@/lib/api';
import ky from 'ky';
import type { Server, Flavor, InterfaceAttachment } from '@/lib/nova';

/**
 * Hook to fetch list of servers
 */
export function useServers() {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'servers'],
    queryFn: async () => {
      if (!region) throw new Error('Region not set');
      const data = await ky.get(apiUrl(region, 'nova', 'servers/detail')).json<{ servers: Server[] }>();
      return data.servers;
    },
    enabled: !!region && !!projectId,
  });
}

/**
 * Hook to fetch a single server by ID
 */
export function useServer(id: string, options?: Omit<UseQueryOptions<Server>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'server', id],
    queryFn: async () => {
      if (!region) throw new Error('Region not set');
      const data = await ky.get(apiUrl(region, 'nova', `servers/${id}`)).json<{ server: Server }>();
      return data.server;
    },
    enabled: !!id && !!region && !!projectId,
    ...options,
  });
}

/**
 * Hook to fetch list of flavors
 */
export function useFlavors() {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'flavors'],
    queryFn: async () => {
      if (!region) throw new Error('Region not set');
      const data = await ky.get(apiUrl(region, 'nova', 'flavors/detail')).json<{ flavors: Flavor[] }>();
      return data.flavors;
    },
    enabled: !!region && !!projectId,
  });
}

/**
 * Hook to fetch a single flavor by ID
 */
export function useFlavor(id: string, options?: Omit<UseQueryOptions<Flavor>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'flavor', id],
    queryFn: async () => {
      if (!region) throw new Error('Region not set');
      const data = await ky.get(apiUrl(region, 'nova', `flavors/${id}`)).json<{ flavor: Flavor }>();
      return data.flavor;
    },
    enabled: !!id && !!region && !!projectId,
    ...options,
  });
}

/**
 * Hook to fetch server interface attachments
 */
export function useServerInterfaces(serverId: string, options?: Omit<UseQueryOptions<InterfaceAttachment[]>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'server-interfaces', serverId],
    queryFn: async () => {
      if (!region) throw new Error('Region not set');
      const data = await ky.get(apiUrl(region, 'nova', `servers/${serverId}/os-interface`)).json<{ interfaceAttachments: InterfaceAttachment[] }>();
      return data.interfaceAttachments;
    },
    enabled: !!serverId && !!region && !!projectId,
    ...options,
  });
}
