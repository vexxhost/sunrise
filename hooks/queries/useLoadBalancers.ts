import { queryOptions } from "@tanstack/react-query";
import { openstack } from "@/lib/openstack/actions";
import {
  getLoadBalancerDetailsAction,
  listLoadBalancersAction,
} from "@/lib/openstack/octavia-actions";

export interface LoadBalancerAvailabilityZone {
  name: string;
  description?: string;
  enabled: boolean;
}

export function loadBalancerAvailabilityZonesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "load-balancer-availability-zones"],
    queryFn: async () => {
      const data = await openstack<{
        availability_zones?: LoadBalancerAvailabilityZone[];
      }>({
        regionId: regionId!,
        serviceType: "load-balancer",
        serviceName: "octavia",
        path: "/v2/lbaas/availabilityzones",
        apiVersion: "load-balancer 2.14",
      });

      return (data?.availability_zones ?? [])
        .filter(({ enabled }) => enabled)
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    enabled: Boolean(regionId && projectId),
  });
}

export function loadBalancersQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "octavia", "load-balancers"],
    queryFn: () => listLoadBalancersAction(regionId, projectId),
    enabled: Boolean(regionId && projectId),
  });
}

export function loadBalancerDetailsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  id: string,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "octavia", "load-balancer", id],
    queryFn: () => getLoadBalancerDetailsAction(id, regionId, projectId),
    enabled: Boolean(regionId && projectId && id),
  });
}
