import { z } from "zod";

import {
  microversionSupport,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";
import type { MutationErrorCode } from "@/lib/mutations";
import { isOctaviaAmphoraProvider } from "@/lib/openstack/octavia";
import type {
  OctaviaL7Policy,
  OctaviaListener,
  OctaviaMember,
  OctaviaPool,
  OctaviaPoolSessionPersistence,
} from "@/types/openstack";

export const OCTAVIA_POOL_PROTOCOLS = ["HTTP", "TCP", "HTTPS", "UDP"] as const;
export type OctaviaPoolProtocol = (typeof OCTAVIA_POOL_PROTOCOLS)[number];

export const OCTAVIA_POOL_TLS_MICROVERSION = "2.8";
const poolTlsReference = z
  .string()
  .max(255)
  .refine((ref) => Boolean(ref.trim()))
  .nullable();
export const poolTlsSnapshotSchema = z.object({
  enabled: z.boolean(),
  caRef: poolTlsReference,
  clientRef: poolTlsReference,
  crlRef: poolTlsReference,
});
export type PoolTlsSnapshot = z.infer<typeof poolTlsSnapshotSchema>;

export function readPoolTls(pool: {
  tls_enabled?: unknown;
  ca_tls_container_ref?: unknown;
  tls_container_ref?: unknown;
  crl_container_ref?: unknown;
}) {
  const result = poolTlsSnapshotSchema.safeParse({
    enabled: pool.tls_enabled,
    caRef: pool.ca_tls_container_ref,
    clientRef: pool.tls_container_ref,
    crlRef: pool.crl_container_ref,
  });
  return result.success ? result.data : null;
}

export function poolTlsReadApiVersion(
  capabilities: OpenStackServiceCapabilities,
) {
  const support = microversionSupport(
    capabilities,
    OCTAVIA_POOL_TLS_MICROVERSION,
    "Backend TLS",
  );
  return support.status === "supported"
    ? `load-balancer ${support.requestedMicroversion}`
    : undefined;
}

export function poolTlsEditBlock(current: ReturnType<typeof readPoolTls>) {
  if (!current)
    return "Octavia did not report the complete backend TLS configuration.";
  return current.clientRef || current.crlRef
    ? "Backend TLS is read-only when a client certificate or revocation list is configured."
    : null;
}

export function samePoolTls(
  current: PoolTlsSnapshot | null,
  expected: PoolTlsSnapshot,
) {
  return (
    current?.enabled === expected.enabled &&
    current.caRef === expected.caRef &&
    current.clientRef === expected.clientRef &&
    current.crlRef === expected.crlRef
  );
}

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

export function canChangeOctaviaPoolMembers(
  pool: Pick<OctaviaPool, "protocol" | "provisioning_status">,
) {
  return (
    pool.provisioning_status?.toUpperCase() === "ACTIVE" &&
    OCTAVIA_POOL_PROTOCOLS.some((protocol) => protocol === pool.protocol)
  );
}

export function isOctaviaBackupMemberPool(
  provider: string | undefined,
  protocol: string,
) {
  // Amphora handles HTTPS passthrough in HAProxy alongside HTTP and TCP.
  return (
    isOctaviaAmphoraProvider(provider) &&
    (protocol === "HTTP" || protocol === "TCP" || protocol === "HTTPS")
  );
}

export function memberBackupMicroversion(
  capabilities: OpenStackServiceCapabilities,
  provider: string | undefined,
  protocol: string,
) {
  if (!isOctaviaBackupMemberPool(provider, protocol)) return undefined;
  const support = microversionSupport(capabilities, "2.1", "Backup members");
  return support.status === "supported"
    ? support.requestedMicroversion
    : undefined;
}

export function formatOctaviaMemberRole(backup: unknown) {
  return backup === true ? "Backup" : backup === false ? "Primary" : "-";
}

export function poolMutationRecovery(
  code: MutationErrorCode,
  retainDraftOnConflict = false,
) {
  const unconfirmed = code === "invalid-response" || code === "network-error";
  return {
    needsRefresh: code === "conflict" || code === "not-found" || unconfirmed,
    needsReopen:
      code === "context-changed" ||
      code === "not-found" ||
      unconfirmed ||
      (code === "conflict" && !retainDraftOnConflict),
  };
}

export function formatOctaviaMemberAddress(
  member: Pick<OctaviaMember, "address" | "protocol_port">,
) {
  const address = member.address.includes(":")
    ? `[${member.address}]`
    : member.address;
  return `${address}:${member.protocol_port}`;
}

export const octaviaMemberIpSchema = z
  .string()
  .trim()
  .pipe(z.union([z.ipv4(), z.ipv6()]));
export const octaviaMemberPortSchema = z.number().int().min(1).max(65535);

export function formatOctaviaMemberMonitor(
  member: Pick<
    OctaviaMember,
    "address" | "protocol_port" | "monitor_address" | "monitor_port"
  >,
) {
  const { monitor_address, monitor_port } = member;
  if (monitor_address == null && monitor_port == null) return null;
  // Null means to use the backend endpoint; omission does not report a setting.
  const address = monitor_address === null ? member.address : monitor_address;
  const port = monitor_port === null ? member.protocol_port : monitor_port;
  if (address && port !== undefined)
    return formatOctaviaMemberAddress({ address, protocol_port: port });
  return address ?? (port === undefined ? null : `port ${port}`);
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
