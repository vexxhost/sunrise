import type { OctaviaListener, OctaviaLoadBalancer } from "@/types/openstack";

export function isOctaviaAmphoraProvider(provider?: string) {
  return ["amphora", "amphorav2", "octavia"].includes(
    provider?.toLowerCase() ?? "",
  );
}

export function loadBalancerListenerPath(
  loadBalancerId: string,
  listenerId: string,
) {
  return `/networking/load-balancers/${encodeURIComponent(loadBalancerId)}/listeners/${encodeURIComponent(listenerId)}`;
}

export function loadBalancerPoolPath(loadBalancerId: string, poolId: string) {
  return `/networking/load-balancers/${encodeURIComponent(loadBalancerId)}/pools/${encodeURIComponent(poolId)}`;
}

export function canChangeOctaviaListeners(
  loadBalancer: Pick<OctaviaLoadBalancer, "provisioning_status">,
) {
  return loadBalancer.provisioning_status?.toUpperCase() === "ACTIVE";
}

export function canChangeOctaviaListener(
  listener: Pick<OctaviaListener, "provisioning_status">,
) {
  return ["ACTIVE", "ERROR"].includes(
    listener.provisioning_status?.toUpperCase(),
  );
}

export function octaviaListenerDeletionBlock(
  listener: Pick<OctaviaListener, "default_pool_id" | "l7policies">,
) {
  if (listener.default_pool_id || listener.l7policies?.length) {
    return "Detach the default pool and remove any L7 policies before deleting this listener.";
  }
  if (
    listener.default_pool_id !== null ||
    !Array.isArray(listener.l7policies)
  ) {
    return "Octavia did not return the listener's attachment information. Refresh before deleting it.";
  }
  return null;
}

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
  return resource.provisioning_status?.toUpperCase().startsWith("PENDING_");
}

export function canUpdateLoadBalancer(
  loadBalancer: Pick<OctaviaLoadBalancer, "provisioning_status">,
) {
  return !isOctaviaProvisioning(loadBalancer);
}

export function canDeleteLoadBalancer(
  loadBalancer: Pick<
    OctaviaLoadBalancer,
    "listeners" | "pools" | "provisioning_status"
  >,
) {
  return (
    !isOctaviaProvisioning(loadBalancer) &&
    (loadBalancer.listeners?.length ?? 0) === 0 &&
    (loadBalancer.pools?.length ?? 0) === 0
  );
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

export function loadBalancerVipAddresses(
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
