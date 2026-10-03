export function detectIpVersion(value: string): 0 | 4 | 6 {
  const address = value.trim();
  const octets = address.split(".");

  if (
    octets.length === 4 &&
    octets.every(
      (octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255,
    )
  ) {
    return 4;
  }

  if (!address.includes(":") || address.includes("%") || /\s/.test(address)) {
    return 0;
  }

  try {
    const parsed = new URL(`http://[${address}]/`);
    return parsed.hostname.startsWith("[") ? 6 : 0;
  } catch {
    return 0;
  }
}

export function getCidrPrefixLength(value: string): number | null {
  const [, prefix, ...rest] = value.trim().split("/");
  if (rest.length || prefix === undefined || !/^\d+$/.test(prefix)) {
    return null;
  }
  return Number(prefix);
}

export function getCidrValidationError(
  value: string,
  expectedVersion: 4 | 6,
  options: { require64?: boolean } = {},
) {
  const cidr = value.trim();
  if (!cidr) return null;

  const [address, prefix, ...rest] = cidr.split("/");
  const version = detectIpVersion(address ?? "");
  const prefixLength = getCidrPrefixLength(cidr);
  const maxPrefixLength = version === 4 ? 32 : 128;

  if (
    !version ||
    rest.length ||
    prefix === undefined ||
    prefixLength === null ||
    prefixLength > maxPrefixLength
  ) {
    const example = expectedVersion === 6 ? "2001:db8::/64" : "10.0.0.0/24";
    return `Enter a valid IPv${expectedVersion} CIDR, such as ${example}.`;
  }

  if (version !== expectedVersion) {
    return `Enter an IPv${expectedVersion} CIDR for the selected IP version.`;
  }

  if (options.require64 && prefixLength !== 64) {
    return "A /64 prefix is required for SLAAC and DHCPv6 stateless addressing.";
  }

  return null;
}
