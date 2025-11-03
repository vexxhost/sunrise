/**
 * TanStack Query hooks for Nova (Compute) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import ky from 'ky';
import type { Server, Flavor, InterfaceAttachment } from '@/lib/nova';

/**
 * Hook to fetch list of servers
 */
export function useServers() {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'servers'],
    queryFn: async () => {
      const data = await ky.get('/api/proxy/nova/servers/detail').json<{ servers: Server[] }>();
      return data.servers;
    },
  });
}

/**
 * Hook to fetch a single server by ID
 */
export function useServer(id: string, options?: Omit<UseQueryOptions<Server>, 'queryKey' | 'queryFn'>) {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'server', id],
    queryFn: async () => {
      const data = await ky.get(`/api/proxy/nova/servers/${id}`).json<{ server: Server }>();
      return data.server;
    },
    enabled: !!id,
    ...options,
  });
}

/**
 * Hook to fetch list of flavors
 */
export function useFlavors() {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'flavors'],
    queryFn: async () => {
      const data = await ky.get('/api/proxy/nova/flavors/detail').json<{ flavors: Flavor[] }>();
      return data.flavors;
    },
  });
}

/**
 * Hook to fetch a single flavor by ID
 */
export function useFlavor(id: string, options?: Omit<UseQueryOptions<Flavor>, 'queryKey' | 'queryFn'>) {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'flavor', id],
    queryFn: async () => {
      const data = await ky.get(`/api/proxy/nova/flavors/${id}`).json<{ flavor: Flavor }>();
      return data.flavor;
    },
    enabled: !!id,
    ...options,
  });
}

/**
 * Hook to fetch server interface attachments
 */
export function useServerInterfaces(serverId: string, options?: Omit<UseQueryOptions<InterfaceAttachment[]>, 'queryKey' | 'queryFn'>) {
  const { region } = useKeystone();

  return useQuery({
    queryKey: [region, 'server-interfaces', serverId],
    queryFn: async () => {
      const data = await ky.get(`/api/proxy/nova/servers/${serverId}/os-interface`).json<{ interfaceAttachments: InterfaceAttachment[] }>();
      return data.interfaceAttachments;
    },
    enabled: !!serverId,
    ...options,
  });
}
