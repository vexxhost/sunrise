/**
 * TanStack Query hooks for Neutron (Network) API
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import { apiUrl } from '@/lib/api';
import ky from 'ky';
import type { Network, Port, SecurityGroup } from '@/lib/network';

/**
 * Hook to fetch list of networks
 */
export function useNetworks() {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'networks'],
    queryFn: async () => {
      const data = await ky.get(apiUrl(region, 'neutron', 'v2.0/networks')).json<{ networks: Network[] }>();
      return data.networks;
    },
  });
}

/**
 * Hook to fetch a single network by ID
 */
export function useNetwork(id: string, options?: Omit<UseQueryOptions<Network>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'network', id],
    queryFn: async () => {
      const data = await ky.get(apiUrl(region, 'neutron', `v2.0/networks/${id}`)).json<{ network: Network }>();
      return data.network;
    },
    enabled: !!id,
    ...options,
  });
}

/**
 * Hook to fetch list of ports
 */
export function usePorts() {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'ports'],
    queryFn: async () => {
      const data = await ky.get(apiUrl(region, 'neutron', 'v2.0/ports')).json<{ ports: Port[] }>();
      return data.ports;
    },
  });
}

/**
 * Hook to fetch a single port by ID
 */
export function usePort(id: string, options?: Omit<UseQueryOptions<Port>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'port', id],
    queryFn: async () => {
      const data = await ky.get(apiUrl(region, 'neutron', `v2.0/ports/${id}`)).json<{ port: Port }>();
      return data.port;
    },
    enabled: !!id,
    ...options,
  });
}

/**
 * Hook to fetch list of security groups
 */
export function useSecurityGroups() {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'security-groups'],
    queryFn: async () => {
      const data = await ky.get(apiUrl(region, 'neutron', 'v2.0/security-groups')).json<{ security_groups: SecurityGroup[] }>();
      return data.security_groups;
    },
  });
}

/**
 * Hook to fetch a single security group by ID
 */
export function useSecurityGroup(id: string, options?: Omit<UseQueryOptions<SecurityGroup>, 'queryKey' | 'queryFn'>) {
  const { region, projectId } = useKeystone();

  return useQuery({
    queryKey: [region, projectId, 'security-group', id],
    queryFn: async () => {
      const data = await ky.get(apiUrl(region, 'neutron', `v2.0/security-groups/${id}`)).json<{ security_group: SecurityGroup }>();
      return data.security_group;
    },
    enabled: !!id,
    ...options,
  });
}
