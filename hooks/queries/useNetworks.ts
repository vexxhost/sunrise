/**
 * TanStack Query options for Neutron (Network) API
 */

import { queryOptions } from "@tanstack/react-query";
import { openstack } from "@/lib/openstack/actions";
import type {
  FloatingIp,
  Network,
  Port,
  Router,
  SecurityGroup,
  Subnet,
} from "@/types/openstack";

function withQuery(path: string, values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Query options for fetching list of networks
 */
export function networksQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "networks"],
    queryFn: async () => {
      const data = await openstack<{ networks: Network[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: "/v2.0/networks",
      });

      if (!data) {
        return [];
      }

      return data.networks;
    },
    enabled: !!regionId,
  });
}

/** Networks owned by the active project. */
export function projectNetworksQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "project-networks"],
    queryFn: async () => {
      const data = await openstack<{ networks: Network[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: withQuery("/v2.0/networks", { project_id: projectId }),
      });

      return data?.networks ?? [];
    },
    enabled: !!regionId && !!projectId,
  });
}

/** External networks are read-only context for the project topology. */
export function externalNetworksQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "external-networks"],
    queryFn: async () => {
      const data = await openstack<{ networks: Network[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: withQuery("/v2.0/networks", { "router:external": "true" }),
      });

      return data?.networks ?? [];
    },
    enabled: !!regionId && !!projectId,
  });
}

export function subnetsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "subnets"],
    queryFn: async () => {
      const data = await openstack<{ subnets: Subnet[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: withQuery("/v2.0/subnets", { project_id: projectId }),
      });

      return data?.subnets ?? [];
    },
    enabled: !!regionId && !!projectId,
  });
}

/** Subnets visible to the active project, including shared/RBAC networks. */
export function visibleSubnetsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "visible-subnets"],
    queryFn: async () => {
      const data = await openstack<{ subnets: Subnet[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: "/v2.0/subnets",
      });

      return data?.subnets ?? [];
    },
    enabled: !!regionId && !!projectId,
  });
}

export function networkSubnetsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  networkId: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "network-subnets", networkId],
    queryFn: async () => {
      const data = await openstack<{ subnets: Subnet[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: withQuery("/v2.0/subnets", { network_id: networkId }),
      });

      return data?.subnets ?? [];
    },
    enabled: !!regionId && !!projectId && !!networkId,
  });
}

export function subnetQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "subnet", id],
    queryFn: async () => {
      const data = await openstack<{ subnet: Subnet }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: `/v2.0/subnets/${encodeURIComponent(id)}`,
      });
      if (!data) throw new Error("Subnet not found");
      return data.subnet;
    },
    enabled: !!regionId && !!projectId && !!id,
  });
}

export function routersQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "routers"],
    queryFn: async () => {
      const data = await openstack<{ routers: Router[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: withQuery("/v2.0/routers", { project_id: projectId }),
      });

      return data?.routers ?? [];
    },
    enabled: !!regionId && !!projectId,
  });
}

export function routerQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "router", id],
    queryFn: async () => {
      const data = await openstack<{ router: Router }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: `/v2.0/routers/${encodeURIComponent(id)}`,
      });
      if (!data) throw new Error("Router not found");
      return data.router;
    },
    enabled: !!regionId && !!projectId && !!id,
  });
}

export function routerPortsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  routerId: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "router-ports", routerId],
    queryFn: async () => {
      const data = await openstack<{ ports: Port[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: withQuery("/v2.0/ports", { device_id: routerId }),
      });
      return data?.ports ?? [];
    },
    enabled: !!regionId && !!projectId && !!routerId,
  });
}

/**
 * Query options for fetching a single network by ID
 */
export function networkQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "network", id],
    queryFn: async () => {
      const data = await openstack<{ network: Network }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: `/v2.0/networks/${encodeURIComponent(id)}`,
      });

      if (!data) {
        throw new Error("Network not found");
      }

      return data.network;
    },
    enabled: !!id && !!regionId && !!projectId,
  });
}

/**
 * Query options for fetching list of ports
 */
export function portsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "ports"],
    queryFn: async () => {
      const data = await openstack<{ ports: Port[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: withQuery("/v2.0/ports", { project_id: projectId }),
      });

      if (!data) {
        return [];
      }

      return data.ports;
    },
    enabled: !!regionId && !!projectId,
  });
}

export function floatingIpsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "floating-ips"],
    queryFn: async () => {
      const data = await openstack<{ floatingips: FloatingIp[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: withQuery("/v2.0/floatingips", { project_id: projectId }),
      });

      return data?.floatingips ?? [];
    },
    enabled: !!regionId && !!projectId,
  });
}

export function floatingIpQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "floating-ip", id],
    queryFn: async () => {
      const data = await openstack<{ floatingip: FloatingIp }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: `/v2.0/floatingips/${encodeURIComponent(id)}`,
      });
      if (!data) throw new Error("Floating IP not found");
      return data.floatingip;
    },
    enabled: !!regionId && !!projectId && !!id,
  });
}

/**
 * Query options for fetching a single port by ID
 */
export function portQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "port", id],
    queryFn: async () => {
      const data = await openstack<{ port: Port }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: `/v2.0/ports/${encodeURIComponent(id)}`,
      });

      if (!data) {
        throw new Error("Port not found");
      }

      return data.port;
    },
    enabled: !!id && !!regionId && !!projectId,
  });
}

/**
 * Query options for fetching list of security groups
 */
export function securityGroupsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "security-groups"],
    queryFn: async () => {
      const data = await openstack<{ security_groups: SecurityGroup[] }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: withQuery("/v2.0/security-groups", { project_id: projectId }),
      });

      if (!data) {
        return [];
      }

      return data.security_groups;
    },
    enabled: !!regionId && !!projectId,
  });
}

/**
 * Query options for fetching a single security group by ID
 */
export function securityGroupQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "security-group", id],
    queryFn: async () => {
      const data = await openstack<{ security_group: SecurityGroup }>({
        regionId: regionId!,
        serviceType: "network",
        serviceName: "neutron",
        path: `/v2.0/security-groups/${encodeURIComponent(id)}`,
      });

      if (!data) {
        throw new Error("Security group not found");
      }

      return data.security_group;
    },
    enabled: !!id && !!regionId && !!projectId,
  });
}
