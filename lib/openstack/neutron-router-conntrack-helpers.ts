export const NEUTRON_CONNTRACK_HELPER_PROTOCOLS = [
  "dccp",
  "icmp",
  "ipv6-icmp",
  "sctp",
  "tcp",
  "udp",
] as const;

export type NeutronConntrackHelperProtocol =
  (typeof NEUTRON_CONNTRACK_HELPER_PROTOCOLS)[number];

export function neutronConntrackHelperProtocolLabel(
  protocol: NeutronConntrackHelperProtocol,
) {
  return protocol === "ipv6-icmp" ? "IPv6 ICMP" : protocol.toUpperCase();
}
