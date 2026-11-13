import "server-only";

import { createLogger } from "@/lib/logging";
import { getApiMicroversionPolicy } from "@/lib/deployment-config";
import {
  parseExtensionAliases,
  parseMicroversionDiscovery,
  preferredMicroversionSupport,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getServiceEndpoint } from "@/lib/openstack/catalog";
import { getSession } from "@/lib/session";
import { configuredApiMicroversion } from "@/lib/openstack/microversion-policy";

const logger = createLogger("openstack.capabilities");

export const NOVA_VOLUME_ATTACHMENT_UPDATE_MICROVERSION = "2.85";
export const NEUTRON_ATOMIC_EXTRA_ROUTE_EXTENSION = "extraroute-atomic";
export const CINDER_BASELINE_MICROVERSION = "3.0";
export const CINDER_DETAIL_MICROVERSION = "3.65";
export const CINDER_IN_USE_SNAPSHOT_MICROVERSION = "3.66";

function unavailable(
  serviceType: string,
  message: string,
): OpenStackServiceCapabilities {
  return {
    discoveryStatus: "unavailable",
    message,
    serviceType,
  };
}

function versionRoot(endpoint: string, majorVersion: RegExp): string {
  const url = new URL(endpoint);
  const segments = url.pathname.split("/").filter(Boolean);
  const versionIndex = segments.findIndex((segment) =>
    majorVersion.test(segment),
  );
  if (versionIndex >= 0) {
    url.pathname = `/${segments.slice(0, versionIndex + 1).join("/")}`;
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function discoverComputeCapabilities(
  regionId: string,
): Promise<OpenStackServiceCapabilities> {
  const configuredMicroversionMaximum = configuredApiMicroversion(
    getApiMicroversionPolicy(),
    "compute",
    regionId,
  );
  const session = await getSession();
  const token = session.keystoneProjectToken;
  const endpoint = token
    ? await getServiceEndpoint(regionId, "compute", "nova", token)
    : null;
  if (!endpoint) {
    const capabilities = unavailable(
      "compute",
      "Compute API microversion discovery was unavailable.",
    );
    return configuredMicroversionMaximum
      ? { ...capabilities, configuredMicroversionMaximum }
      : capabilities;
  }
  const payload = await openstackRequest<unknown>({
    acceptedStatuses: [300],
    endpointOverride: versionRoot(endpoint, /^v2(?:\.1)?$/i),
    regionId,
    serviceType: "compute",
    serviceName: "nova",
    path: "/",
  });
  const discovery = parseMicroversionDiscovery(payload);

  if (!discovery) {
    logger.warn("compute-microversions-unavailable", { regionId });
    const capabilities = unavailable(
      "compute",
      "Compute API microversion discovery was unavailable.",
    );
    return configuredMicroversionMaximum
      ? { ...capabilities, configuredMicroversionMaximum }
      : capabilities;
  }
  const { microversions } = discovery;

  return {
    ...(configuredMicroversionMaximum ? { configuredMicroversionMaximum } : {}),
    discoveryStatus: "available",
    message: microversions
      ? `Compute API microversions ${microversions.minimum} through ${microversions.maximum} are available.${configuredMicroversionMaximum ? ` Sunrise will not request newer than ${configuredMicroversionMaximum}.` : ""}`
      : "The Compute API does not advertise microversion support.",
    microversions,
    serviceType: "compute",
  };
}

export async function discoverNetworkCapabilities(
  regionId: string,
): Promise<OpenStackServiceCapabilities> {
  const payload = await openstackRequest<unknown>({
    regionId,
    serviceType: "network",
    serviceName: "neutron",
    path: "/v2.0/extensions",
  });
  const extensions = parseExtensionAliases(payload);

  if (!extensions) {
    logger.warn("network-extensions-unavailable", { regionId });
    return unavailable(
      "network",
      "Networking API extension discovery was unavailable.",
    );
  }

  return {
    discoveryStatus: "available",
    extensions,
    message: `${extensions.length} Networking API extensions are available.`,
    serviceType: "network",
  };
}

export async function discoverBlockStorageCapabilities(
  regionId: string,
): Promise<OpenStackServiceCapabilities> {
  const configuredMicroversionMaximum = configuredApiMicroversion(
    getApiMicroversionPolicy(),
    "volume",
    regionId,
  );
  const session = await getSession();
  const token = session.keystoneProjectToken;
  const endpoint = token
    ? await getServiceEndpoint(regionId, "volumev3", "cinder", token)
    : null;
  if (!endpoint) {
    const capabilities = unavailable(
      "volume",
      "Block Storage API microversion discovery was unavailable.",
    );
    return configuredMicroversionMaximum
      ? { ...capabilities, configuredMicroversionMaximum }
      : capabilities;
  }

  const payload = await openstackRequest<unknown>({
    acceptedStatuses: [300],
    endpointOverride: versionRoot(endpoint, /^v3$/i),
    regionId,
    serviceType: "volumev3",
    serviceName: "cinder",
    path: "/",
  });
  const discovery = parseMicroversionDiscovery(payload);

  if (!discovery) {
    logger.warn("block-storage-microversions-unavailable", { regionId });
    const capabilities = unavailable(
      "volume",
      "Block Storage API microversion discovery was unavailable.",
    );
    return configuredMicroversionMaximum
      ? { ...capabilities, configuredMicroversionMaximum }
      : capabilities;
  }
  const { microversions } = discovery;

  return {
    ...(configuredMicroversionMaximum ? { configuredMicroversionMaximum } : {}),
    discoveryStatus: "available",
    message: microversions
      ? `Block Storage API microversions ${microversions.minimum} through ${microversions.maximum} are available.${configuredMicroversionMaximum ? ` Sunrise will not request newer than ${configuredMicroversionMaximum}.` : ""}`
      : "The Block Storage API does not advertise microversion support.",
    microversions,
    serviceType: "volume",
  };
}

export async function cinderDetailApiVersion(regionId?: string) {
  if (!regionId) return `volume ${CINDER_BASELINE_MICROVERSION}`;

  const capabilities = await discoverBlockStorageCapabilities(regionId);
  const support = preferredMicroversionSupport(
    capabilities,
    CINDER_BASELINE_MICROVERSION,
    CINDER_DETAIL_MICROVERSION,
    "Extended Block Storage details",
  );
  if (support.status === "unsupported") {
    throw new Error(support.message);
  }

  return `volume ${support.requestedMicroversion ?? CINDER_BASELINE_MICROVERSION}`;
}

export async function discoverDeploymentCapabilities(regionId: string) {
  const [compute, network, volume] = await Promise.all([
    discoverComputeCapabilities(regionId),
    discoverNetworkCapabilities(regionId),
    discoverBlockStorageCapabilities(regionId),
  ]);
  return { compute, network, volume };
}
