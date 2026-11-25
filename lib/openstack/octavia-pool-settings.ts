import {
  microversionSupport,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";
import { isOctaviaAmphoraProvider } from "@/lib/openstack/octavia";
import type { OctaviaListener, OctaviaPool } from "@/types/openstack";

export const OCTAVIA_POOL_PROTOCOLS = ["HTTP", "TCP", "HTTPS", "UDP"] as const;
export type OctaviaPoolProtocol = (typeof OCTAVIA_POOL_PROTOCOLS)[number];
export const OCTAVIA_POOL_ALGORITHMS = [
  "ROUND_ROBIN",
  "LEAST_CONNECTIONS",
  "SOURCE_IP",
] as const;
export type OctaviaPoolAlgorithm = (typeof OCTAVIA_POOL_ALGORITHMS)[number];

const poolAlgorithmLabels: Record<OctaviaPoolAlgorithm, string> = {
  ROUND_ROBIN: "Round robin",
  LEAST_CONNECTIONS: "Least connections",
  SOURCE_IP: "Source IP",
};

export function formatPoolAlgorithm(algorithm: string) {
  return Object.hasOwn(poolAlgorithmLabels, algorithm)
    ? poolAlgorithmLabels[algorithm as OctaviaPoolAlgorithm]
    : algorithm;
}

const listenerPoolProtocols: Record<string, readonly OctaviaPoolProtocol[]> = {
  HTTP: ["HTTP"],
  TERMINATED_HTTPS: ["HTTP"],
  HTTPS: ["TCP", "HTTPS"],
  TCP: ["HTTP", "TCP", "HTTPS"],
  UDP: ["UDP"],
};

export function availablePoolProtocols(
  provider: string | undefined,
  capabilities: OpenStackServiceCapabilities,
  listenerProtocol?: string,
) {
  if (!isOctaviaAmphoraProvider(provider)) return [];
  const allowed =
    listenerProtocol === undefined
      ? OCTAVIA_POOL_PROTOCOLS
      : Object.hasOwn(listenerPoolProtocols, listenerProtocol)
        ? listenerPoolProtocols[listenerProtocol]
        : [];
  return allowed.filter(
    (protocol) =>
      protocol !== "UDP" ||
      microversionSupport(capabilities, "2.1", "UDP pools").status ===
        "supported",
  );
}

export function canAttachNewOctaviaPool(
  listener: Pick<
    OctaviaListener,
    "default_pool_id" | "protocol" | "provisioning_status"
  >,
) {
  return (
    listener.provisioning_status?.toUpperCase() === "ACTIVE" &&
    listener.default_pool_id === null &&
    Object.hasOwn(listenerPoolProtocols, listener.protocol)
  );
}

export function octaviaPoolDeletionBlock(
  pool: Pick<OctaviaPool, "members" | "healthmonitor_id" | "listeners">,
) {
  // Octavia omits healthmonitor_id when there is no monitor.
  if (pool.members?.length || pool.healthmonitor_id != null) {
    return "Remove the pool members and health monitor before deleting this pool.";
  }
  if (
    !Array.isArray(pool.members) ||
    !Array.isArray(pool.listeners) ||
    pool.listeners.some((ref) => typeof ref?.id !== "string")
  ) {
    return "Octavia did not return the pool's dependency information. Refresh before deleting it.";
  }
  return null;
}
