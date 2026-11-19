import type { FloatingIpPortForwarding } from "@/types/openstack";

export const NEUTRON_PORT_FORWARDING_PROTOCOLS = [
  "tcp",
  "udp",
  "sctp",
  "dccp",
  "icmp",
  "ipv6-icmp",
] as const;

export type NeutronPortForwardingProtocol =
  (typeof NEUTRON_PORT_FORWARDING_PROTOCOLS)[number];

export type PortForwardingPortMapping = {
  externalPort?: number;
  externalPortRange?: string;
  internalPort?: number;
  internalPortRange?: string;
};

export type PortForwardingPortValues = {
  externalEnd?: number;
  externalStart: number;
  internalEnd?: number;
  internalStart: number;
};

export type PortForwardingPortMappingResult =
  { ok: true; value: PortForwardingPortMapping } | { ok: false; error: string };

function validPort(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 65_535;
}

export function buildPortForwardingPortMapping({
  externalEnd,
  externalStart,
  internalEnd,
  internalStart,
}: PortForwardingPortValues): PortForwardingPortMappingResult {
  const resolvedExternalEnd = externalEnd ?? externalStart;
  const resolvedInternalEnd = internalEnd ?? internalStart;
  if (
    ![
      externalStart,
      resolvedExternalEnd,
      internalStart,
      resolvedInternalEnd,
    ].every(validPort)
  ) {
    return {
      ok: false,
      error: "Ports must be whole numbers between 1 and 65535.",
    };
  }
  if (
    resolvedExternalEnd < externalStart ||
    resolvedInternalEnd < internalStart
  ) {
    return {
      ok: false,
      error: "A port range cannot end before it starts.",
    };
  }

  const externalSpan = resolvedExternalEnd - externalStart;
  const internalSpan = resolvedInternalEnd - internalStart;
  if (internalSpan > 0 && internalSpan !== externalSpan) {
    return {
      ok: false,
      error:
        "Use matching public and internal range sizes, or map a public range to one internal port.",
    };
  }

  if (externalSpan === 0 && internalSpan === 0) {
    return {
      ok: true,
      value: {
        externalPort: externalStart,
        internalPort: internalStart,
      },
    };
  }

  return {
    ok: true,
    value: {
      externalPortRange: `${externalStart}:${resolvedExternalEnd}`,
      internalPortRange:
        internalSpan === 0
          ? String(internalStart)
          : `${internalStart}:${resolvedInternalEnd}`,
    },
  };
}

export function portForwardingExternalPorts(
  forwarding: FloatingIpPortForwarding,
) {
  return (
    forwarding.external_port_range ??
    (forwarding.external_port == null
      ? "Not reported"
      : String(forwarding.external_port))
  );
}

export function portForwardingInternalPorts(
  forwarding: FloatingIpPortForwarding,
) {
  return (
    forwarding.internal_port_range ??
    (forwarding.internal_port == null
      ? "Not reported"
      : String(forwarding.internal_port))
  );
}

export function parsePortForwardingPortRange(value: string | null | undefined) {
  if (!value) return null;
  const [startValue, endValue = startValue] = value.split(":", 2);
  const start = Number(startValue);
  const end = Number(endValue);
  return validPort(start) && validPort(end) && end >= start
    ? { start, end }
    : null;
}
