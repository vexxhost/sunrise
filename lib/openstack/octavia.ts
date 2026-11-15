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
  loadBalancer: Pick<
    OctaviaLoadBalancer,
    "additional_vips" | "vip_address" | "vip_port_id"
  >,
  clusterApiHosts: ReadonlySet<string>,
  floatingIpsByPort: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const floatingIps = loadBalancer.vip_port_id
    ? floatingIpsByPort.get(loadBalancer.vip_port_id)
    : undefined;
  return Boolean(
    loadBalancerVipAddresses(loadBalancer).some((vipAddress) =>
      clusterApiHosts.has(vipAddress),
    ) ||
    (floatingIps &&
      [...floatingIps].some((floatingIp) => clusterApiHosts.has(floatingIp))),
  );
}

export function clusterApiHostsNeedingFloatingIps(
  loadBalancers: ReadonlyArray<
    Pick<OctaviaLoadBalancer, "additional_vips" | "vip_address">
  >,
  clusterApiHosts: ReadonlySet<string>,
) {
  const vipAddresses = new Set(
    loadBalancers.flatMap((loadBalancer) =>
      loadBalancerVipAddresses(loadBalancer),
    ),
  );
  return [...clusterApiHosts].filter((host) => !vipAddresses.has(host));
}

export function indexFloatingIpAddressesByPort(
  floatingIps: ReadonlyArray<{
    floating_ip_address: string;
    port_id?: string | null;
  }>,
) {
  const addressesByPort = new Map<string, Set<string>>();
  for (const { floating_ip_address: address, port_id: portId } of floatingIps) {
    if (!portId) continue;
    const addresses = addressesByPort.get(portId) ?? new Set<string>();
    addresses.add(address);
    addressesByPort.set(portId, addresses);
  }
  return addressesByPort;
}

function loadBalancerVipAddresses(
  loadBalancer: Pick<OctaviaLoadBalancer, "additional_vips" | "vip_address">,
) {
  const additionalVips = Array.isArray(loadBalancer.additional_vips)
    ? loadBalancer.additional_vips
    : [];
  return [
    loadBalancer.vip_address,
    ...additionalVips.map((vip) =>
      vip && typeof vip === "object" ? vip.ip_address : undefined,
    ),
  ]
    .map((address) =>
      typeof address === "string" ? address.replace(/^\[|\]$/g, "") : null,
    )
    .filter((address): address is string => Boolean(address));
}
