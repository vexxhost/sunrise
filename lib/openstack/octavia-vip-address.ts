import {
  detectIpVersion,
  getCidrPrefixLength,
  getCidrValidationError,
} from "@/lib/network-address";

type VipSubnet = { cidr: string; ip_version: 4 | 6 };

export const INVALID_FIXED_VIP =
  "Enter a single IPv4 address without a CIDR prefix.";

function ipv4Number(address: string) {
  return address
    .split(".")
    .reduce((value, octet) => value * 256 + Number(octet), 0);
}

export function fixedVipAddressError(
  input: string,
  subnet: VipSubnet | undefined,
) {
  const address = input.trim();
  if (!address) return null;
  if (detectIpVersion(address) !== 4) return INVALID_FIXED_VIP;
  if (!subnet) return "Select a VIP subnet for this address.";
  if (subnet.ip_version !== 4) {
    return "Clear the address to use automatic allocation on an IPv6 subnet.";
  }

  const prefix = getCidrPrefixLength(subnet.cidr);
  if (prefix === null || getCidrValidationError(subnet.cidr, 4)) {
    return "The selected subnet did not report a valid IPv4 CIDR.";
  }

  const network = subnet.cidr.trim().split("/")[0];
  const blockSize = 2 ** (32 - prefix);
  if (
    Math.floor(ipv4Number(address) / blockSize) !==
    Math.floor(ipv4Number(network) / blockSize)
  ) {
    return `Enter an IPv4 address in ${subnet.cidr}.`;
  }
  return null;
}
