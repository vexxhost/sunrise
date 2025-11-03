/**
 * TanStack Query hooks for Neutron (Network) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import type { Network, Port, SecurityGroup } from '@/types/openstack';
import { useApiClient } from './useApiClient';

/**
 * Hook to fetch list of networks
 */
export function useNetworks() {
  const { region, project } = useKeystone();
  const client = useApiClient('neutron');

  return useQuery({
    queryKey: [region, project?.id, 'networks'],
    queryFn: async () => {
      const data = await client!.get('v2.0/networks').json<{ networks: Network[] }>();
      return data.networks;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single network by ID
 */
export function useNetwork(id: string, options?: Omit<UseQueryOptions<Network>, 'queryKey' | 'queryFn'>) {
  const { region, project } = useKeystone();
  const client = useApiClient('neutron');

  return useQuery({
    queryKey: [region, project?.id, 'network', id],
    queryFn: async () => {
      const data = await client!.get(`v2.0/networks/${id}`).json<{ network: Network }>();
      return data.network;
    },
    enabled: !!id && !!client,
    ...options,
  });
}

/**
 * Hook to fetch list of ports
 */
export function usePorts() {
  const { region, project } = useKeystone();
  const client = useApiClient('neutron');

  return useQuery({
    queryKey: [region, project?.id, 'ports'],
    queryFn: async () => {
      const data = await client!.get('v2.0/ports').json<{ ports: Port[] }>();
      return data.ports;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single port by ID
 */
export function usePort(id: string, options?: Omit<UseQueryOptions<Port>, 'queryKey' | 'queryFn'>) {
  const { region, project } = useKeystone();
  const client = useApiClient('neutron');

  return useQuery({
    queryKey: [region, project?.id, 'port', id],
    queryFn: async () => {
      const data = await client!.get(`v2.0/ports/${id}`).json<{ port: Port }>();
      return data.port;
    },
    enabled: !!id && !!client,
    ...options,
  });
}

/**
 * Hook to fetch list of security groups
 */
export function useSecurityGroups() {
  const { region, project } = useKeystone();
  const client = useApiClient('neutron');

  return useQuery({
    queryKey: [region, project?.id, 'security-groups'],
    queryFn: async () => {
      const data = await client!.get('v2.0/security-groups').json<{ security_groups: SecurityGroup[] }>();
      return data.security_groups;
    },
    enabled: !!client,
  });
}

/**
 * Hook to fetch a single security group by ID
 */
export function useSecurityGroup(id: string, options?: Omit<UseQueryOptions<SecurityGroup>, 'queryKey' | 'queryFn'>) {
  const { region, project } = useKeystone();
  const client = useApiClient('neutron');

  return useQuery({
    queryKey: [region, project?.id, 'security-group', id],
    queryFn: async () => {
      const data = await client!.get(`v2.0/security-groups/${id}`).json<{ security_group: SecurityGroup }>();
      return data.security_group;
    },
    enabled: !!id && !!client,
    ...options,
  });
}
