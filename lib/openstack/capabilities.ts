export type CapabilityDiscoveryStatus = "available" | "unavailable";

export type MicroversionRange = {
  maximum: string;
  minimum: string;
};

export type OpenStackServiceCapabilities = {
  discoveryStatus: CapabilityDiscoveryStatus;
  extensions?: string[];
  message: string;
  microversions?: MicroversionRange | null;
  serviceType: string;
};

export type MicroversionDiscovery = {
  microversions: MicroversionRange | null;
};

export type OpenStackFeatureSupport = {
  message: string;
  requestedMicroversion?: string;
  status: "supported" | "unsupported" | "unknown";
};

type VersionDescription = {
  id?: unknown;
  min_version?: unknown;
  status?: unknown;
  version?: unknown;
};

const microversionPattern = /^\d+\.\d+$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function versionDescription(value: unknown): VersionDescription | null {
  return asRecord(value) as VersionDescription | null;
}

function usableVersion(value: unknown): string | null {
  return typeof value === "string" && microversionPattern.test(value)
    ? value
    : null;
}

export function compareMicroversions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function parseMicroversionRange(
  payload: unknown,
): MicroversionRange | null {
  return parseMicroversionDiscovery(payload)?.microversions ?? null;
}

export function parseMicroversionDiscovery(
  payload: unknown,
): MicroversionDiscovery | null {
  const root = asRecord(payload);
  if (!root) return null;

  const candidates = Array.isArray(root.versions)
    ? root.versions.map(versionDescription).filter(Boolean)
    : [versionDescription(root.version)].filter(Boolean);
  const supported = candidates.flatMap((candidate) => {
    const status =
      typeof candidate?.status === "string"
        ? candidate.status.toUpperCase()
        : "";
    if (status && status !== "CURRENT" && status !== "SUPPORTED") return [];

    return [
      {
        candidate,
        priority: status === "CURRENT" ? 2 : status === "SUPPORTED" ? 1 : 0,
      },
    ];
  });
  if (!supported.length) return null;

  const priority = Math.max(...supported.map((entry) => entry.priority));
  const preferred = supported.filter((entry) => entry.priority === priority);
  const ranges = preferred.flatMap(({ candidate }) => {
    const minimum = usableVersion(candidate?.min_version);
    const maximum = usableVersion(candidate?.version);
    if (minimum && maximum && compareMicroversions(minimum, maximum) <= 0) {
      return [{ maximum, minimum }];
    }
    return [];
  });
  ranges.sort((left, right) =>
    compareMicroversions(right.maximum, left.maximum),
  );

  const selected = ranges[0];
  if (selected) return { microversions: selected };

  const explicitlyUnsupported = preferred.every(
    ({ candidate }) =>
      candidate?.min_version === "" && candidate?.version === "",
  );
  return explicitlyUnsupported ? { microversions: null } : null;
}

export function parseExtensionAliases(payload: unknown): string[] | null {
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.extensions)) return null;

  const aliases = root.extensions.flatMap((extension) => {
    const alias = asRecord(extension)?.alias;
    return typeof alias === "string" && alias.trim() ? [alias.trim()] : [];
  });
  return [...new Set(aliases)].sort();
}

export function microversionSupport(
  capabilities: OpenStackServiceCapabilities,
  required: string,
  feature: string,
): OpenStackFeatureSupport {
  const range = capabilities.microversions;
  if (capabilities.discoveryStatus !== "available") {
    return {
      status: "unknown",
      message: `${feature} support could not be verified. The service will validate it when used.`,
    };
  }
  if (range === undefined) {
    return {
      status: "unknown",
      message: `${feature} support could not be verified. The service will validate it when used.`,
    };
  }
  if (range === null) {
    return {
      status: "unsupported",
      message: `${feature} requires API microversion ${required}, but this cloud does not advertise microversion support.`,
    };
  }

  if (compareMicroversions(required, range.maximum) <= 0) {
    const requestedMicroversion =
      compareMicroversions(required, range.minimum) < 0
        ? range.minimum
        : required;
    return {
      status: "supported",
      message: `${feature} is supported by the active cloud.`,
      requestedMicroversion,
    };
  }

  return {
    status: "unsupported",
    message: `${feature} requires API microversion ${required}, but this cloud advertises ${range.minimum} through ${range.maximum}.`,
  };
}

export function extensionSupport(
  capabilities: OpenStackServiceCapabilities,
  required: string,
  feature: string,
): OpenStackFeatureSupport {
  if (
    capabilities.discoveryStatus !== "available" ||
    !capabilities.extensions
  ) {
    return {
      status: "unknown",
      message: `${feature} support could not be verified. The service will validate it when used.`,
    };
  }

  if (capabilities.extensions.includes(required)) {
    return {
      status: "supported",
      message: `${feature} is supported by the active cloud.`,
    };
  }

  return {
    status: "unsupported",
    message: `${feature} is not available because this cloud does not advertise the ${required} extension.`,
  };
}
