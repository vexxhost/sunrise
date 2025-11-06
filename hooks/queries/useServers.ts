/**
 * TanStack Query hooks for Nova (Compute) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystoneStore } from '@/stores/useKeystoneStore';
import type { Server, Flavor, ServerListResponse, ServerResponse, FlavorListResponse, FlavorResponse, Keypair, KeypairListResponse, KeypairResponse, InterfaceAttachment } from '@/types/openstack';
import { useApiClient } from './useApiClient';

/**
 * Hook to fetch list of servers
 */
export function useServers() {
  const { region, project } = useKeystoneStore();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region?.id, project?.id, 'servers'],
    queryFn: async () => {
      const data = await client!.get('servers/detail').json<ServerListResponse>();
      return data.servers;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single server by ID
 */
export function useServer(id: string, options?: Omit<UseQueryOptions<Server>, 'queryKey' | 'queryFn'>) {
  const { region, project } = useKeystoneStore();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region?.id, project?.id, 'server', id],
    queryFn: async () => {
      const data = await client!.get(`servers/${id}`).json<ServerResponse>();
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
  const { region, project } = useKeystoneStore();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region?.id, project?.id, 'flavors'],
    queryFn: async () => {
      const data = await client!.get('flavors/detail').json<FlavorListResponse>();
      return data.flavors;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single flavor by ID
 */
export function useFlavor(id: string, options?: Omit<UseQueryOptions<Flavor>, 'queryKey' | 'queryFn'>) {
  const { region, project } = useKeystoneStore();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region?.id, project?.id, 'flavor', id],
    queryFn: async () => {
      const data = await client!.get(`flavors/${id}`).json<FlavorResponse>();
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
  const { region, project } = useKeystoneStore();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region?.id, project?.id, 'server-interfaces', serverId],
    queryFn: async () => {
      const data = await client!.get(`servers/${serverId}/os-interface`).json<{ interfaceAttachments: InterfaceAttachment[] }>();
      return data.interfaceAttachments;
    },
    enabled: !!serverId && !!client,
    ...options,
  });
}

/**
 * Hook to fetch list of keypairs
 */
export function useKeypairs() {
  const { region, project } = useKeystoneStore();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region?.id, project?.id, 'keypairs'],
    queryFn: async () => {
      const data = await client!.get('os-keypairs').json<KeypairListResponse>();
      // Nova returns keypairs as an array of objects with "keypair" property
      return data.keypairs.map(item => item.keypair);
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single keypair by name
 */
export function useKeypair(name: string, options?: Omit<UseQueryOptions<Keypair>, 'queryKey' | 'queryFn'>) {
  const { region, project } = useKeystoneStore();
  const client = useApiClient('nova');

  return useQuery({
    queryKey: [region?.id, project?.id, 'keypair', name],
    queryFn: async () => {
      const data = await client!.get(`os-keypairs/${name}`).json<KeypairResponse>();
      return data.keypair;
    },
    enabled: !!name && !!client,
    ...options,
  });
}
