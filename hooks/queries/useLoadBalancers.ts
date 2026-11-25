import { queryOptions } from "@tanstack/react-query";
import {
  getLoadBalancerDetailsAction,
  getLoadBalancerListenerDetailsAction,
  listLoadBalancerAvailabilityZonesAction,
  listLoadBalancerFloatingIpsAction,
  listLoadBalancerPoolChoicesAction,
  listLoadBalancersAction,
} from "@/lib/openstack/octavia-actions";

export function loadBalancerAvailabilityZonesQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "load-balancer-availability-zones"],
    queryFn: () => listLoadBalancerAvailabilityZonesAction(regionId, projectId),
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

export function loadBalancerFloatingIpsQueryOptions(
  regionId: string | undefined,
  projectId: string | undefined,
  portId: string | undefined,
) {
  return queryOptions({
    queryKey: [regionId, projectId, "octavia", "floating-ips", portId],
    queryFn: () =>
      listLoadBalancerFloatingIpsAction(portId!, regionId, projectId),
    enabled: Boolean(regionId && projectId && portId),
  });
}

export function loadBalancerPoolChoicesQueryOptions(
  regionId: string | undefined,
  projectId: string,
  loadBalancerId: string,
) {
  return queryOptions({
    queryKey: [
      ...loadBalancerDetailsQueryOptions(regionId, projectId, loadBalancerId)
        .queryKey,
      "pool-choices",
    ],
    queryFn: () =>
      listLoadBalancerPoolChoicesAction(loadBalancerId, regionId, projectId),
  });
}

export function loadBalancerListenerDetailsQueryOptions(
  regionId: string,
  projectId: string,
  loadBalancerId: string,
  listenerId: string,
) {
  return queryOptions({
    queryKey: [
      ...loadBalancerDetailsQueryOptions(regionId, projectId, loadBalancerId)
        .queryKey,
      "listener",
      listenerId,
    ],
    queryFn: () =>
      getLoadBalancerListenerDetailsAction(
        loadBalancerId,
        listenerId,
        regionId,
        projectId,
      ),
  });
}
