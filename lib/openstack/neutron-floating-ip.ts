import type { Port, Server } from "@/types/openstack";

export interface FloatingIpPortOption {
  fixedIpAddress: string;
  label: string;
  portId: string;
  resourceName: string;
  resourceType: string;
  value: string;
}

function isIpv4Address(value: string) {
  const octets = value.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      if (!/^\d{1,3}$/.test(octet)) return false;
      const number = Number(octet);
      return number >= 0 && number <= 255 && String(number) === octet;
    })
  );
}

function resourceTypeForPort(deviceOwner: string) {
  const owner = deviceOwner.toLowerCase();
  if (owner.startsWith("compute:")) return "Instance";
  if (
    owner === "octavia" ||
    owner === "neutron:loadbalancerv2" ||
    owner.startsWith("octavia:")
  ) {
    return "Load balancer";
  }
  if (owner.startsWith("baremetal:") || owner.startsWith("ironic:")) {
    return "Bare metal instance";
  }
  if (owner === "trunk:subport") return "Trunk subport";
  if (!owner) return "Unattached port";
  return "Service port";
}

export function floatingIpPortSelectionValue(
  portId: string,
  fixedIpAddress: string,
) {
  return `${portId}|${fixedIpAddress}`;
}

export function parseFloatingIpPortSelection(value: string) {
  if (value === "none") return null;
  const separator = value.indexOf("|");
  if (separator < 1 || separator === value.length - 1) return null;
  return {
    portId: value.slice(0, separator),
    fixedIpAddress: value.slice(separator + 1),
  };
}

export function buildFloatingIpPortOptions({
  externalNetworkIds = [],
  ports,
  servers = [],
}: {
  externalNetworkIds?: Iterable<string>;
  ports: Port[];
  servers?: Server[];
}) {
  const externalNetworks = new Set(externalNetworkIds);
  const serverNames = new Map(
    servers.map((server) => [server.id, server.name]),
  );
  const options: FloatingIpPortOption[] = [];

  for (const port of ports) {
    // Horizon applies the same boundary: network-owned ports are control-plane
    // plumbing, not user-facing floating IP targets.
    if (
      port.device_owner.toLowerCase().startsWith("network:") ||
      externalNetworks.has(port.network_id)
    ) {
      continue;
    }

    const resourceType = resourceTypeForPort(port.device_owner);
    const resourceName =
      (resourceType === "Instance" && serverNames.get(port.device_id)) ||
      port.name ||
      port.device_id ||
      port.id;

    for (const fixedIp of port.fixed_ips) {
      if (!isIpv4Address(fixedIp.ip_address)) continue;
      const label = `${resourceType}: ${resourceName} · ${fixedIp.ip_address}`;
      options.push({
        fixedIpAddress: fixedIp.ip_address,
        label,
        portId: port.id,
        resourceName,
        resourceType,
        value: floatingIpPortSelectionValue(port.id, fixedIp.ip_address),
      });
    }
  }

  return options.sort(
    (left, right) =>
      left.resourceType.localeCompare(right.resourceType) ||
      left.resourceName.localeCompare(right.resourceName) ||
      left.fixedIpAddress.localeCompare(right.fixedIpAddress),
  );
}
