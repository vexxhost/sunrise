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
