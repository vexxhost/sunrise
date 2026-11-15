import type { OctaviaLoadBalancer } from "@/types/openstack";

export function formatOctaviaStatus(status: string | null | undefined) {
  if (!status) return "Unknown";
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function isOctaviaProvisioning(
  resource: Pick<OctaviaLoadBalancer, "provisioning_status">,
) {
  return resource.provisioning_status.toUpperCase().startsWith("PENDING_");
}

export function octaviaStatusVariant(
  status: string | null | undefined,
): "secondary" | "destructive" | "outline" {
  switch (status?.toUpperCase()) {
    case "ACTIVE":
    case "ONLINE":
      return "secondary";
    case "ERROR":
    case "DEGRADED":
      return "destructive";
    default:
      return "outline";
  }
}

export function octaviaEndpointHost(endpoint: string | null | undefined) {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}

export function isClusterApiLoadBalancer(
  loadBalancer: Pick<OctaviaLoadBalancer, "vip_address" | "vip_port_id">,
  clusterApiHosts: ReadonlySet<string>,
  floatingIpByPort: ReadonlyMap<string, string>,
) {
  const vipAddress = loadBalancer.vip_address?.replace(/^\[|\]$/g, "");
  const floatingIp = loadBalancer.vip_port_id
    ? floatingIpByPort.get(loadBalancer.vip_port_id)
    : undefined;
  return Boolean(
    (vipAddress && clusterApiHosts.has(vipAddress)) ||
    (floatingIp && clusterApiHosts.has(floatingIp)),
  );
}

export function clusterApiAssociationNeedsFloatingIps(
  loadBalancers: ReadonlyArray<Pick<OctaviaLoadBalancer, "vip_address">>,
  clusterApiHosts: ReadonlySet<string>,
) {
  const vipAddresses = new Set(
    loadBalancers
      .map(({ vip_address: vipAddress }) => vipAddress?.replace(/^\[|\]$/g, ""))
      .filter((vipAddress): vipAddress is string => Boolean(vipAddress)),
  );
  return [...clusterApiHosts].some((host) => !vipAddresses.has(host));
}
