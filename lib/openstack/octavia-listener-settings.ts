import { detectIpVersion, getCidrValidationError } from "@/lib/network-address";
import {
  microversionSupport,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";
import { loadBalancerVipAddresses } from "@/lib/openstack/octavia";
import type { OctaviaLoadBalancer } from "@/types/openstack";

export const OCTAVIA_LISTENER_PROTOCOLS = [
  "HTTP",
  "TCP",
  "HTTPS",
  "UDP",
] as const;
export type OctaviaListenerProtocol =
  (typeof OCTAVIA_LISTENER_PROTOCOLS)[number];

const LISTENER_BASELINE = "2.0";
const LISTENER_TIMEOUTS = "2.1";
const LISTENER_CIDRS = "2.12";
const LISTENER_UDP = "2.1";

export const LISTENER_NUMERIC_FIELDS = {
  connection_limit: { label: "Connection limit", min: -1, max: 2_147_483_647 },
  timeout_client_data: {
    label: "Client data timeout (ms)",
    min: 0,
    max: 2_073_600_000,
  },
  timeout_member_connect: {
    label: "Member connect timeout (ms)",
    min: 0,
    max: 2_073_600_000,
  },
  timeout_member_data: {
    label: "Member data timeout (ms)",
    min: 0,
    max: 2_073_600_000,
  },
  timeout_tcp_inspect: {
    label: "TCP inspect timeout (ms)",
    min: 0,
    max: 2_073_600_000,
  },
} as const;

export type ListenerNumericField = keyof typeof LISTENER_NUMERIC_FIELDS;
export const LISTENER_NUMERIC_KEYS = Object.keys(
  LISTENER_NUMERIC_FIELDS,
) as ListenerNumericField[];
export type OctaviaListenerSettings = Partial<
  Record<ListenerNumericField, number | null>
> & {
  allowed_cidrs?: string[];
};
export const LISTENER_CIDR_MAX = 500;
export const LISTENER_CIDR_LENGTH_MAX = 64;
export const LISTENER_SETTING_KEYS = [
  ...LISTENER_NUMERIC_KEYS,
  "allowed_cidrs",
] as const;
export type ListenerSettingKey = (typeof LISTENER_SETTING_KEYS)[number];

type ListenerParent = Pick<
  OctaviaLoadBalancer,
  "provider" | "vip_address" | "vip_sg_ids" | "additional_vips"
>;

function isAmphora(provider?: string) {
  return ["amphora", "amphorav2", "octavia"].includes(
    provider?.toLowerCase() ?? "",
  );
}

export function availableListenerProtocols(
  provider: string | undefined,
  capabilities: OpenStackServiceCapabilities,
): OctaviaListenerProtocol[] {
  const amphora = isAmphora(provider);
  const udpProvider = amphora || provider?.toLowerCase() === "ovn";
  return OCTAVIA_LISTENER_PROTOCOLS.filter((protocol) => {
    if (protocol === "TCP") return true;
    if (protocol === "UDP")
      return (
        udpProvider &&
        microversionSupport(capabilities, LISTENER_UDP, "UDP listeners")
          .status === "supported"
      );
    return amphora;
  });
}

export function listenerSettingVersion(key: ListenerSettingKey) {
  if (key === "allowed_cidrs") return LISTENER_CIDRS;
  return key === "connection_limit" ? LISTENER_BASELINE : LISTENER_TIMEOUTS;
}

export function listenerSettingUnavailable(
  key: ListenerSettingKey,
  parent: ListenerParent,
  protocol: string,
  capabilities: OpenStackServiceCapabilities,
  value?: string[] | number | null,
) {
  if (!isAmphora(parent.provider))
    return "These settings are not verified for this load balancer provider.";
  if (
    key.startsWith("timeout_") &&
    !["HTTP", "HTTPS", "TCP", "TERMINATED_HTTPS"].includes(protocol)
  ) {
    return "These timeouts are not available for this protocol.";
  }
  if (
    key === "allowed_cidrs" &&
    parent.vip_sg_ids?.length &&
    !(Array.isArray(value) && value.length === 0)
  ) {
    return "Custom VIP security groups control which sources may connect.";
  }
  const required = listenerSettingVersion(key);
  if (required === LISTENER_BASELINE) return null;
  const support = microversionSupport(
    capabilities,
    required,
    key === "allowed_cidrs" ? "Allowed CIDRs" : "Listener timeouts",
  );
  return support.status === "supported" ? null : support.message;
}

export function listenerReadApiVersion(
  capabilities: OpenStackServiceCapabilities,
) {
  for (const version of [LISTENER_CIDRS, LISTENER_TIMEOUTS]) {
    const support = microversionSupport(
      capabilities,
      version,
      "Listener settings",
    );
    if (support.status === "supported")
      return "load-balancer " + support.requestedMicroversion;
  }
  return undefined;
}

export function listenerParentReadApiVersion(
  capabilities: OpenStackServiceCapabilities,
) {
  for (const version of ["2.29", "2.26"]) {
    const support = microversionSupport(
      capabilities,
      version,
      "Listener VIP configuration",
    );
    if (support.status === "supported")
      return "load-balancer " + support.requestedMicroversion;
  }
  return undefined;
}

export function requiredListenerWriteVersion(
  keys: readonly ListenerSettingKey[],
  protocol?: OctaviaListenerProtocol,
) {
  if (keys.includes("allowed_cidrs")) return LISTENER_CIDRS;
  return protocol === "UDP" || keys.some((key) => key.startsWith("timeout_"))
    ? LISTENER_TIMEOUTS
    : LISTENER_BASELINE;
}

export function listenerCidrError(
  cidrs: readonly string[],
  parent: ListenerParent,
) {
  if (cidrs.length > LISTENER_CIDR_MAX)
    return "Use at most " + LISTENER_CIDR_MAX + " CIDRs.";
  if (!cidrs.length) return null;
  const families = new Set(
    loadBalancerVipAddresses(parent).map(detectIpVersion).filter(Boolean),
  );
  if (families.size === 0)
    return "Octavia did not return a VIP address for validating the allowlist.";
  const seen = new Set<string>();
  for (const cidr of cidrs) {
    const version = detectIpVersion(cidr.split("/")[0] ?? "");
    if (
      !version ||
      cidr.length > LISTENER_CIDR_LENGTH_MAX ||
      /\s/.test(cidr) ||
      getCidrValidationError(cidr, version)
    ) {
      return "Enter valid IPv4 or IPv6 CIDRs, one per line.";
    }
    if (!families.has(version))
      return "Each CIDR must match the IP version of a load balancer VIP.";
    if (seen.has(cidr)) return "Remove duplicate CIDRs from the allowlist.";
    seen.add(cidr);
  }
  return null;
}

export function sameListenerCidrs(
  left: readonly string[],
  right: readonly string[],
) {
  const sortedRight = [...right].sort();
  return (
    left.length === right.length &&
    [...left].sort().every((cidr, index) => cidr === sortedRight[index])
  );
}
