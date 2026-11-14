import { compareMicroversions } from "@/lib/openstack/capabilities";
import { regionEnvironmentSuffix } from "@/lib/service-policy";

export const configurableMicroversionServices = [
  "compute",
  "share",
  "volume",
] as const;

export type ConfigurableMicroversionService =
  (typeof configurableMicroversionServices)[number];

export type ApiMicroversionPolicy = {
  defaults: Partial<Record<ConfigurableMicroversionService, string>>;
  regional: Partial<
    Record<ConfigurableMicroversionService, Record<string, string>>
  >;
};

type MicroversionEnvironment = Record<string, string | undefined>;

const ENVIRONMENT_PREFIX = "SUNRISE_API_MICROVERSION_";
const minimumSupportedVersions = {
  compute: "2.79",
  share: "2.51",
  volume: "3.0",
} as const satisfies Record<ConfigurableMicroversionService, string>;
const microversionPattern = /^\d+\.\d+$/;
const requestServiceIdentities = {
  compute: {
    headerService: "compute",
    serviceTypes: ["compute"],
  },
  share: {
    headerService: null,
    serviceTypes: ["share", "sharev2"],
  },
  volume: {
    headerService: "volume",
    serviceTypes: ["volume", "volumev2", "volumev3"],
  },
} as const satisfies Record<
  ConfigurableMicroversionService,
  { headerService: string | null; serviceTypes: readonly string[] }
>;

function serviceEnvironmentSuffix(service: ConfigurableMicroversionService) {
  return service.toUpperCase().replaceAll("-", "_");
}

function configuredVersion(name: string, value: string | undefined) {
  const version = value?.trim();
  if (!version) return undefined;
  if (!microversionPattern.test(version)) {
    throw new Error(`${name} must use major.minor numeric syntax`);
  }
  return version;
}

export function parseApiMicroversionPolicy(
  environment: MicroversionEnvironment = {},
): ApiMicroversionPolicy {
  const defaults: ApiMicroversionPolicy["defaults"] = {};
  const regional: ApiMicroversionPolicy["regional"] = {};
  const supportedNames = new Set<string>();

  for (const service of configurableMicroversionServices) {
    const serviceSuffix = serviceEnvironmentSuffix(service);
    const name = `${ENVIRONMENT_PREFIX}${serviceSuffix}`;
    supportedNames.add(name);

    const value = configuredVersion(name, environment[name]);
    if (value) {
      const minimum = minimumSupportedVersions[service];
      if (compareMicroversions(value, minimum) < 0) {
        throw new Error(`${name} must be ${minimum} or newer`);
      }
      defaults[service] = value;
    }

    const regionalPrefix = `${name}_`;
    for (const [regionalName, regionalValue] of Object.entries(environment)) {
      if (!regionalName.startsWith(regionalPrefix)) continue;
      supportedNames.add(regionalName);

      const regionSuffix = regionalName.slice(regionalPrefix.length);
      if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(regionSuffix)) {
        throw new Error(
          `${regionalName} must end with a normalized uppercase region suffix`,
        );
      }
      const version = configuredVersion(regionalName, regionalValue);
      if (!version) continue;
      const minimum = minimumSupportedVersions[service];
      if (compareMicroversions(version, minimum) < 0) {
        throw new Error(`${regionalName} must be ${minimum} or newer`);
      }
      (regional[service] ??= {})[regionSuffix] = version;
    }
  }

  const unknown = Object.keys(environment).find(
    (name) =>
      name.startsWith(ENVIRONMENT_PREFIX) &&
      environment[name]?.trim() &&
      !supportedNames.has(name),
  );
  if (unknown) {
    throw new Error(
      `${unknown} is not a supported API microversion setting. Supported services: ${configurableMicroversionServices.join(", ")}`,
    );
  }

  return { defaults, regional };
}

export function configuredApiMicroversion(
  policy: ApiMicroversionPolicy,
  service: ConfigurableMicroversionService,
  regionId?: string | null,
) {
  if (regionId) {
    const regional =
      policy.regional[service]?.[regionEnvironmentSuffix(regionId)];
    if (regional) return regional;
  }
  return policy.defaults[service];
}

export function apiMicroversionOverrideCount(policy: ApiMicroversionPolicy) {
  return (
    Object.keys(policy.defaults).length +
    Object.values(policy.regional).reduce(
      (count, values) => count + Object.keys(values ?? {}).length,
      0,
    )
  );
}

export function apiMicroversionPolicyViolation(
  policy: ApiMicroversionPolicy,
  serviceType: string,
  regionId: string | null | undefined,
  apiVersion: string | undefined,
) {
  if (!apiVersion) return undefined;

  const service = configurableMicroversionServices.find((candidate) =>
    requestServiceIdentities[candidate].serviceTypes.some(
      (requestServiceType) => requestServiceType === serviceType,
    ),
  );
  if (!service) return undefined;

  const maximum = configuredApiMicroversion(policy, service, regionId);
  if (!maximum) return undefined;

  const expectedHeaderService = requestServiceIdentities[service].headerService;
  const parts = apiVersion.trim().split(/\s+/);
  const requested = expectedHeaderService
    ? parts.length === 2 && parts[0] === expectedHeaderService
      ? parts[1]
      : undefined
    : parts.length === 1
      ? parts[0]
      : undefined;
  if (!requested || !microversionPattern.test(requested)) {
    return `${serviceType} API requests must use an explicit numeric microversion when a maximum is configured.`;
  }
  if (compareMicroversions(requested, maximum) > 0) {
    return `${serviceType} API microversion ${requested} exceeds the configured maximum ${maximum} for ${regionId ?? "the active region"}.`;
  }
  return undefined;
}
