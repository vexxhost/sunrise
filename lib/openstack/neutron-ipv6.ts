import type { IPv6AddressMode, IPv6ConfigurationMode } from "@/types/openstack";

export const ipv6ConfigurationOptions: Array<{
  description: string;
  label: string;
  value: IPv6ConfigurationMode;
}> = [
  {
    value: "none",
    label: "No automatic address configuration",
    description:
      "Addresses are configured manually or by a system outside OpenStack.",
  },
  {
    value: "slaac-openstack",
    label: "SLAAC (OpenStack router)",
    description:
      "OpenStack router advertisements provide addresses and the default route.",
  },
  {
    value: "slaac-external",
    label: "SLAAC (external router)",
    description:
      "An external router provides addresses and the default route through advertisements.",
  },
  {
    value: "dhcpv6-stateful",
    label: "DHCPv6 stateful (OpenStack)",
    description:
      "OpenStack DHCPv6 provides addresses and optional network information.",
  },
  {
    value: "dhcpv6-stateless",
    label: "DHCPv6 stateless (OpenStack)",
    description:
      "Router advertisements provide addresses; OpenStack DHCPv6 provides optional information.",
  },
];

export function getIpv6ConfigurationAttributes(mode: IPv6ConfigurationMode): {
  ipv6_address_mode: IPv6AddressMode | null;
  ipv6_ra_mode: IPv6AddressMode | null;
} {
  switch (mode) {
    case "slaac-openstack":
      return { ipv6_address_mode: "slaac", ipv6_ra_mode: "slaac" };
    case "slaac-external":
      return { ipv6_address_mode: "slaac", ipv6_ra_mode: null };
    case "dhcpv6-stateful":
      return {
        ipv6_address_mode: "dhcpv6-stateful",
        ipv6_ra_mode: "dhcpv6-stateful",
      };
    case "dhcpv6-stateless":
      return {
        ipv6_address_mode: "dhcpv6-stateless",
        ipv6_ra_mode: "dhcpv6-stateless",
      };
    case "none":
      return { ipv6_address_mode: null, ipv6_ra_mode: null };
  }
}

export function getIpv6ConfigurationMode(
  addressMode: IPv6AddressMode | null,
  raMode: IPv6AddressMode | null,
): IPv6ConfigurationMode {
  if (addressMode === "slaac" && raMode === null) return "slaac-external";
  if (addressMode === "slaac" && raMode === "slaac") {
    return "slaac-openstack";
  }
  if (addressMode === "dhcpv6-stateful" && raMode === "dhcpv6-stateful") {
    return "dhcpv6-stateful";
  }
  if (addressMode === "dhcpv6-stateless" && raMode === "dhcpv6-stateless") {
    return "dhcpv6-stateless";
  }
  return "none";
}

export function usesIpv6AutoAddressing(mode: IPv6ConfigurationMode) {
  return (
    mode === "slaac-openstack" ||
    mode === "slaac-external" ||
    mode === "dhcpv6-stateless"
  );
}
