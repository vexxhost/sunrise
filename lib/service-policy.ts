export const sunriseServiceIds = [
  "compute",
  "networking",
  "kubernetes",
  "object-storage",
  "identity",
  "orchestration",
  "dns",
  "shared-file-system",
  "key-manager",
] as const;

export type SunriseServiceId = (typeof sunriseServiceIds)[number];

export const openStackServiceIds = [
  "compute",
  "image",
  "volume",
  "network",
  "load-balancer",
  "container-infra",
  "object-storage-s3",
  "object-storage",
  "identity",
  "orchestration",
  "dns",
  "share",
  "key-manager",
] as const;

export type OpenStackServiceId = (typeof openStackServiceIds)[number];

export const objectStorageBackends = ["s3", "swift"] as const;

export type ObjectStorageBackend = (typeof objectStorageBackends)[number];

export const objectStorageBackendServiceIds = {
  s3: "object-storage-s3",
  swift: "object-storage",
} as const satisfies Record<ObjectStorageBackend, OpenStackServiceId>;

export type ObjectStorageBackendServiceId =
  (typeof objectStorageBackendServiceIds)[ObjectStorageBackend];

export type SunriseDisableTarget = OpenStackServiceId;

export type ServicePolicy = {
  disabledServices: SunriseDisableTarget[];
  disabledServicesByRegion: Record<string, SunriseDisableTarget[]>;
  objectStorageBackends: ObjectStorageBackend[];
};

type ServicePolicyEnvironment = {
  disabledServices?: string;
  disabledServicesByRegion?: Record<string, string | undefined>;
  objectStorageBackends?: string;
};

const disableTargetIds = new Set<string>(openStackServiceIds);
const backendIds = new Set<string>(objectStorageBackends);

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function parseServiceList(value: unknown, source: string) {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") {
    throw new Error(`${source} must be a comma-separated string`);
  }

  return unique(
    value
      .split(",")
      .map((candidate) => candidate.trim().toLowerCase())
      .filter(Boolean)
      .map((candidate) => {
        if (!disableTargetIds.has(candidate)) {
          throw new Error(
            `${source} contains unknown service or backend "${candidate}". Supported values: ${[...disableTargetIds].join(", ")}`,
          );
        }
        return candidate as SunriseDisableTarget;
      }),
  );
}

export function regionEnvironmentSuffix(regionId: string) {
  const suffix = regionId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!suffix) {
    throw new Error(
      `Region ${JSON.stringify(regionId)} cannot be mapped to an environment variable suffix`,
    );
  }
  return suffix;
}

function parseRegionalServiceMap(
  values: Record<string, string | undefined> = {},
) {
  const configuredSuffixes = new Map<string, string>();
  const servicesByRegion: Record<string, SunriseDisableTarget[]> = {};

  for (const [configuredSuffix, services] of Object.entries(values)) {
    const suffix = regionEnvironmentSuffix(configuredSuffix);
    const existing = configuredSuffixes.get(suffix);
    if (existing) {
      throw new Error(
        `Region suffixes ${JSON.stringify(existing)} and ${JSON.stringify(configuredSuffix)} both map to ${suffix}`,
      );
    }
    configuredSuffixes.set(suffix, configuredSuffix);
    servicesByRegion[suffix] = parseServiceList(
      services,
      `SUNRISE_DISABLED_SERVICES_${configuredSuffix}`,
    );
  }

  return servicesByRegion;
}

function parseObjectStorageBackends(value?: string) {
  const candidates = (value?.trim() ? value : "swift")
    .split(",")
    .map((candidate) => candidate.trim().toLowerCase())
    .filter(Boolean);
  if (candidates.length === 0) {
    throw new Error("SUNRISE_OBJECT_STORAGE_BACKENDS must not be empty");
  }

  return unique(
    candidates.map((candidate) => {
      if (!backendIds.has(candidate)) {
        throw new Error(
          `SUNRISE_OBJECT_STORAGE_BACKENDS contains unknown backend "${candidate}". Supported backends: ${objectStorageBackends.join(", ")}`,
        );
      }
      return candidate as ObjectStorageBackend;
    }),
  );
}

export function parseServicePolicy({
  disabledServices,
  disabledServicesByRegion,
  objectStorageBackends: configuredBackends,
}: ServicePolicyEnvironment = {}): ServicePolicy {
  return {
    disabledServices: parseServiceList(
      disabledServices,
      "SUNRISE_DISABLED_SERVICES",
    ),
    disabledServicesByRegion: parseRegionalServiceMap(disabledServicesByRegion),
    objectStorageBackends: parseObjectStorageBackends(configuredBackends),
  };
}

export const defaultServicePolicy = parseServicePolicy();

export function isServiceEnabled(
  policy: ServicePolicy,
  serviceId: OpenStackServiceId,
  regionId?: string | null,
) {
  if (policy.disabledServices.includes(serviceId)) return false;
  if (!regionId) return true;
  return !policy.disabledServicesByRegion[
    regionEnvironmentSuffix(regionId)
  ]?.includes(serviceId);
}

const sunriseServiceDependencies: Record<
  Exclude<SunriseServiceId, "object-storage">,
  OpenStackServiceId[]
> = {
  compute: ["compute", "image", "volume"],
  networking: ["network"],
  kubernetes: ["container-infra"],
  identity: ["identity"],
  orchestration: ["orchestration"],
  dns: ["dns"],
  "shared-file-system": ["share"],
  "key-manager": ["key-manager"],
};

export function isSunriseServiceEnabled(
  policy: ServicePolicy,
  serviceId: SunriseServiceId,
  regionId?: string | null,
) {
  if (serviceId === "object-storage") {
    return enabledObjectStorageBackends(policy, regionId).length > 0;
  }
  return sunriseServiceDependencies[serviceId].some((dependency) =>
    isServiceEnabled(policy, dependency, regionId),
  );
}

export function isObjectStorageBackendEnabled(
  policy: ServicePolicy,
  backend: ObjectStorageBackend,
  regionId?: string | null,
) {
  const serviceId = objectStorageBackendServiceIds[backend];
  if (policy.disabledServices.includes(serviceId)) return false;
  if (!regionId) return true;
  return !policy.disabledServicesByRegion[
    regionEnvironmentSuffix(regionId)
  ]?.includes(serviceId);
}

export function enabledObjectStorageBackends(
  policy: ServicePolicy,
  regionId?: string | null,
) {
  return policy.objectStorageBackends.filter((backend) =>
    isObjectStorageBackendEnabled(policy, backend, regionId),
  );
}
