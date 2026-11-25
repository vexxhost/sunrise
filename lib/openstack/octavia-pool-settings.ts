import {
  microversionSupport,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";
import { isOctaviaAmphoraProvider } from "@/lib/openstack/octavia";
import type {
  OctaviaL7Policy,
  OctaviaListener,
  OctaviaPool,
  OctaviaPoolSessionPersistence,
} from "@/types/openstack";

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

export const OCTAVIA_POOL_PERSISTENCE_MODES = [
  "SOURCE_IP",
  "HTTP_COOKIE",
  "APP_COOKIE",
] as const;

export type OctaviaPoolPersistenceMode =
  (typeof OCTAVIA_POOL_PERSISTENCE_MODES)[number];
type PersistenceChoice = { type: string; cookie_name?: string };

const poolPersistenceLabels: Record<OctaviaPoolPersistenceMode, string> = {
  SOURCE_IP: "Source IP",
  HTTP_COOKIE: "HTTP cookie",
  APP_COOKIE: "App cookie",
};

export function formatPoolPersistence(mode: string) {
  return Object.hasOwn(poolPersistenceLabels, mode)
    ? poolPersistenceLabels[mode as OctaviaPoolPersistenceMode]
    : mode;
}

export function availablePoolPersistenceModes(
  protocol: string,
): readonly OctaviaPoolPersistenceMode[] {
  if (protocol === "HTTP") return OCTAVIA_POOL_PERSISTENCE_MODES;
  if (protocol === "TCP" || protocol === "HTTPS" || protocol === "UDP")
    return ["SOURCE_IP"];
  return [];
}

export function poolPersistenceError(
  protocol: string,
  choice: PersistenceChoice | null,
) {
  const modes = availablePoolPersistenceModes(protocol);
  if (
    !modes.length ||
    (choice && !modes.some((mode) => mode === choice.type))
  ) {
    return "This session persistence mode is not available for the pool protocol.";
  }
  if (choice?.type === "APP_COOKIE") {
    const name = choice.cookie_name ?? "";
    if (
      !name ||
      name.length > 255 ||
      /[^!#$%&'*+.^_\x60|~0-9A-Za-z-]/.test(name)
    ) {
      return "Enter a valid cookie name of 1 to 255 characters, without spaces or separators.";
    }
  } else if (choice?.cookie_name !== undefined) {
    return "Only App cookie persistence accepts a cookie name.";
  }
  return null;
}

export function readPoolPersistence(
  value: unknown,
): Required<OctaviaPoolSessionPersistence> | null | undefined {
  // Octavia omits session_persistence when there is no configuration.
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const { type, cookie_name, persistence_timeout, persistence_granularity } =
    value as Partial<OctaviaPoolSessionPersistence>;
  if (
    typeof type !== "string" ||
    !type ||
    (cookie_name != null && typeof cookie_name !== "string") ||
    (persistence_timeout != null && !Number.isInteger(persistence_timeout)) ||
    (persistence_granularity != null &&
      typeof persistence_granularity !== "string")
  )
    return undefined;
  return {
    type,
    cookie_name: cookie_name ?? null,
    persistence_timeout: persistence_timeout ?? null,
    persistence_granularity: persistence_granularity ?? null,
  };
}

export function samePoolPersistence(
  current: OctaviaPoolSessionPersistence | null,
  expected: OctaviaPoolSessionPersistence | null,
) {
  if (!current || !expected) return current === expected;
  return (
    current.type === expected.type &&
    (current.cookie_name ?? null) === (expected.cookie_name ?? null) &&
    (current.persistence_timeout ?? null) ===
      (expected.persistence_timeout ?? null) &&
    (current.persistence_granularity ?? null) ===
      (expected.persistence_granularity ?? null)
  );
}

export function describePoolPersistence(value: unknown) {
  const persistence = readPoolPersistence(value);
  if (persistence === undefined) return "Unavailable";
  return persistence ? formatPoolPersistence(persistence.type) : "None";
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

export function supportsOctaviaDefaultPoolChanges(
  provider: string | undefined,
  protocol: string,
) {
  return (
    isOctaviaAmphoraProvider(provider) &&
    Object.hasOwn(listenerPoolProtocols, protocol)
  );
}

export function canUseOctaviaPoolAsDefault(
  pool: Pick<OctaviaPool, "protocol" | "provisioning_status">,
  provider: string | undefined,
  capabilities: OpenStackServiceCapabilities,
  listenerProtocol: string,
) {
  return (
    pool.provisioning_status?.toUpperCase() === "ACTIVE" &&
    availablePoolProtocols(provider, capabilities, listenerProtocol).some(
      (protocol) => protocol === pool.protocol,
    )
  );
}

export function octaviaPoolDeletionBlock(
  pool: Pick<OctaviaPool, "id" | "members" | "healthmonitor_id" | "listeners">,
  l7Policies: ReadonlyArray<Pick<OctaviaL7Policy, "redirect_pool_id">>,
) {
  if (l7Policies.some(({ redirect_pool_id }) => redirect_pool_id === pool.id)) {
    return "Remove or retarget the L7 policies that redirect to this pool before deleting it.";
  }
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
