/**
 * TanStack Query options for Neutron (Network) API
 */

import { queryOptions } from '@tanstack/react-query';
import { openstack } from '@/lib/openstack/actions';
import type { Network, Port, SecurityGroup } from '@/types/openstack';

/**
 * Query options for fetching list of networks
 */
export function networksQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'networks'],
    queryFn: async () => {
      const data = await openstack<{ networks: Network[] }>({
        regionId: regionId!,
        serviceType: 'network',
        serviceName: 'neutron',
        path: '/v2.0/networks',
      });

      if (!data) {
        return [];
      }

      return data.networks;
    },
    enabled: !!regionId,
  });
}

/**
 * Query options for fetching a single network by ID
 */
export function networkQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'network', id],
    queryFn: async () => {
      const data = await openstack<{ network: Network }>({
        regionId: regionId!,
        serviceType: 'network',
        serviceName: 'neutron',
        path: `/v2.0/networks/${id}`,
      });

      if (!data) {
        throw new Error('Network not found');
      }

      return data.network;
    },
    enabled: !!id && !!regionId,
  });
}

/**
 * Query options for fetching list of ports
 */
export function portsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'ports'],
    queryFn: async () => {
      const data = await openstack<{ ports: Port[] }>({
        regionId: regionId!,
        serviceType: 'network',
        serviceName: 'neutron',
        path: '/v2.0/ports',
      });

      if (!data) {
        return [];
      }

      return data.ports;
    },
    enabled: !!regionId,
  });
}

/**
 * Query options for fetching a single port by ID
 */
export function portQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'port', id],
    queryFn: async () => {
      const data = await openstack<{ port: Port }>({
        regionId: regionId!,
        serviceType: 'network',
        serviceName: 'neutron',
        path: `/v2.0/ports/${id}`,
      });

      if (!data) {
        throw new Error('Port not found');
      }

      return data.port;
    },
    enabled: !!id && !!regionId,
  });
}

/**
 * Query options for fetching list of security groups
 */
export function securityGroupsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'security-groups'],
    queryFn: async () => {
      const data = await openstack<{ security_groups: SecurityGroup[] }>({
        regionId: regionId!,
        serviceType: 'network',
        serviceName: 'neutron',
        path: '/v2.0/security-groups',
      });

      if (!data) {
        return [];
      }

      return data.security_groups;
    },
    enabled: !!regionId,
  });
}

/**
 * Query options for fetching a single security group by ID
 */
export function securityGroupQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string
) {
  return queryOptions({
    queryKey: [regionId, projectId, 'security-group', id],
    queryFn: async () => {
      const data = await openstack<{ security_group: SecurityGroup }>({
        regionId: regionId!,
        serviceType: 'network',
        serviceName: 'neutron',
        path: `/v2.0/security-groups/${id}`,
      });

      if (!data) {
        throw new Error('Security group not found');
      }

      return data.security_group;
    },
    enabled: !!id && !!regionId,
  });
}
