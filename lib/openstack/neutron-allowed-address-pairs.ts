function isIpv4Address(value: string) {
  const octets = value.split(".");
  return (
    octets.length === 4 &&
    octets.every(
      (octet) =>
        /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255,
    )
  );
}

const IPV4_BITS = 32;
const IPV6_BITS = 128;
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const IPV4_MULTICAST_START = BigInt("0xe0000000");
const IPV4_MULTICAST_END = BigInt("0xefffffff");
const IPV6_MULTICAST_START = BigInt("0xff000000000000000000000000000000");
const IPV6_MULTICAST_END = BigInt("0xffffffffffffffffffffffffffffffff");

function ipv4Value(value: string): bigint | null {
  if (!isIpv4Address(value)) return null;
  return value
    .split(".")
    .reduce(
      (result, octet) => (result << BigInt(8)) | BigInt(octet),
      BIGINT_ZERO,
    );
}

function expandIpv4Suffix(value: string) {
  const lastColon = value.lastIndexOf(":");
  const suffix = value.slice(lastColon + 1);
  const parsed = ipv4Value(suffix);
  if (parsed === null) return value;
  const hextetMask = BigInt("0xffff");
  const high = Number((parsed >> BigInt(16)) & hextetMask).toString(16);
  const low = Number(parsed & hextetMask).toString(16);
  return `${value.slice(0, lastColon + 1)}${high}:${low}`;
}

function ipv6Value(input: string): bigint | null {
  const value = expandIpv4Suffix(input.toLowerCase());
  const halves = value.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    return null;
  }

  const segments = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (
    segments.length !== 8 ||
    segments.some((segment) => !/^[0-9a-f]{1,4}$/.test(segment))
  ) {
    return null;
  }
  return segments.reduce(
    (result, segment) =>
      (result << BigInt(16)) | BigInt(`0x${segment}`),
    BIGINT_ZERO,
  );
}

function addressRange(value: string) {
  const [address, prefixText, ...rest] = value.trim().split("/");
  if (
    !address ||
    rest.length ||
    (prefixText !== undefined && !/^\d+$/.test(prefixText))
  ) {
    return null;
  }
  const ipv4 = ipv4Value(address);
  const bits = ipv4 === null ? IPV6_BITS : IPV4_BITS;
  const parsedAddress = ipv4 ?? ipv6Value(address);
  const prefix = prefixText === undefined ? bits : Number(prefixText);
  if (
    parsedAddress === null ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > bits
  ) {
    return null;
  }

  const hostBits = BigInt(bits - prefix);
  const hostMask =
    hostBits === BIGINT_ZERO
      ? BIGINT_ZERO
      : (BIGINT_ONE << hostBits) - BIGINT_ONE;
  const allBits = (BIGINT_ONE << BigInt(bits)) - BIGINT_ONE;
  const start = parsedAddress & (allBits ^ hostMask);
  return { bits, end: start | hostMask, prefix, start };
}

export function isMulticastIpAddressOrCidr(value: string) {
  const range = addressRange(value);
  if (!range) return false;
  if (range.bits === IPV4_BITS) {
    if (range.prefix === 0 && range.start === BIGINT_ZERO) return false;
    return (
      range.start <= IPV4_MULTICAST_END &&
      range.end >= IPV4_MULTICAST_START
    );
  }
  return (
    range.start <= IPV6_MULTICAST_END &&
    range.end >= IPV6_MULTICAST_START
  );
}

export function isMulticastMacAddress(value: string) {
  const address = value.trim();
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(address)) return false;
  return (Number.parseInt(address.slice(0, 2), 16) & 1) === 1;
}

export type AllowedAddressPairMulticastErrors = {
  ipAddress?: string;
  macAddress?: string;
};

export function getAllowedAddressPairMulticastErrors(pair: {
  ipAddress: string;
  macAddress: string;
}): AllowedAddressPairMulticastErrors {
  return {
    ...(isMulticastIpAddressOrCidr(pair.ipAddress)
      ? {
          ipAddress:
            "Multicast IP addresses and overlapping CIDRs are not supported.",
        }
      : {}),
    ...(isMulticastMacAddress(pair.macAddress)
      ? { macAddress: "Multicast MAC addresses are not supported." }
      : {}),
  };
}

export function hasRejectedMulticastAllowedAddressPair(
  pairs: Array<{ ipAddress: string; macAddress: string }>,
) {
  return pairs.some((pair) => {
    const errors = getAllowedAddressPairMulticastErrors(pair);
    return Boolean(errors.ipAddress || errors.macAddress);
  });
}

export function isEntireIpv4AddressSpace(value: string) {
  const [address, prefix, ...rest] = value.trim().split("/");
  return (
    rest.length === 0 &&
    prefix !== undefined &&
    /^\d+$/.test(prefix) &&
    Number(prefix) === 0 &&
    isIpv4Address(address ?? "")
  );
}
