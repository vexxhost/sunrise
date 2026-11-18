import "server-only";

import { createLogger } from "@/lib/logging";
import { getApiMicroversionPolicy } from "@/lib/deployment-config";
import {
  parseAdditiveVersionDiscovery,
  parseExtensionAliases,
  parseMicroversionDiscovery,
  preferredMicroversionSupport,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getServiceEndpoint } from "@/lib/openstack/catalog";
import { getSession } from "@/lib/session";
import { configuredApiMicroversion } from "@/lib/openstack/microversion-policy";
import {
  MANILA_BASELINE_MICROVERSION,
  MANILA_DETAIL_MICROVERSION,
} from "@/lib/openstack/manila-microversions";
import {
  MAGNUM_BASELINE_MICROVERSION,
  MAGNUM_DETAIL_MICROVERSION,
  magnumApiVersion,
} from "@/lib/openstack/magnum-microversions";

const logger = createLogger("openstack.capabilities");

export const NOVA_VOLUME_ATTACHMENT_UPDATE_MICROVERSION = "2.85";
export const NEUTRON_ALLOWED_ADDRESS_PAIRS_EXTENSION = "allowed-address-pairs";
export const NEUTRON_ATOMIC_EXTRA_ROUTE_EXTENSION = "extraroute-atomic";
export const NEUTRON_DNS_DOMAIN_PORTS_EXTENSION = "dns-domain-ports";
export const NEUTRON_DNS_INTEGRATION_EXTENSION = "dns-integration";
export const NEUTRON_NETWORK_AVAILABILITY_ZONE_EXTENSION =
  "network_availability_zone";
export const NEUTRON_PORT_SECURITY_EXTENSION = "port-security";
export const NEUTRON_ROUTER_AVAILABILITY_ZONE_EXTENSION =
  "router_availability_zone";
export const NEUTRON_SECURITY_GROUP_EXTENSION = "security-group";
export const CINDER_BASELINE_MICROVERSION = "3.0";
export const CINDER_DETAIL_MICROVERSION = "3.65";
export const CINDER_IN_USE_SNAPSHOT_MICROVERSION = "3.66";
export const OCTAVIA_BASELINE_MICROVERSION = "2.0";
export const OCTAVIA_AVAILABILITY_ZONE_MICROVERSION = "2.14";

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

function unversionedRoot(endpoint: string, majorVersion: RegExp): string {
  const url = new URL(endpoint);
  const segments = url.pathname.split("/").filter(Boolean);
  const versionIndex = segments.findIndex((segment) =>
    majorVersion.test(segment),
  );
  if (versionIndex >= 0) {
    url.pathname = `/${segments.slice(0, versionIndex).join("/")}`;
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
  const session = await getSession();
  const token = session.keystoneProjectToken;
  const endpoint = token
    ? await getServiceEndpoint(regionId, "network", "neutron", token)
    : null;
  if (!endpoint) {
    return unavailable(
      "network",
      "Networking API extension discovery was unavailable.",
    );
  }
  const payload = await openstackRequest<unknown>({
    endpointOverride: endpoint,
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

export async function discoverContainerInfrastructureCapabilities(
  regionId: string,
): Promise<OpenStackServiceCapabilities> {
  const configuredMicroversionMaximum = configuredApiMicroversion(
    getApiMicroversionPolicy(),
    "container-infra",
    regionId,
  );
  const session = await getSession();
  const token = session.keystoneProjectToken;
  const endpoint = token
    ? await getServiceEndpoint(regionId, "container-infra", "magnum", token)
    : null;
  if (!endpoint) {
    const capabilities = unavailable(
      "container-infra",
      "Container Infrastructure API microversion discovery was unavailable.",
    );
    return configuredMicroversionMaximum
      ? { ...capabilities, configuredMicroversionMaximum }
      : capabilities;
  }

  const payload = await openstackRequest<unknown>({
    acceptedStatuses: [300],
    endpointOverride: unversionedRoot(endpoint, /^v1$/i),
    regionId,
    serviceType: "container-infra",
    serviceName: "magnum",
    path: "/",
  });
  const discovery = parseMicroversionDiscovery(payload);

  if (!discovery) {
    logger.warn("container-infrastructure-microversions-unavailable", {
      regionId,
    });
    const capabilities = unavailable(
      "container-infra",
      "Container Infrastructure API microversion discovery was unavailable.",
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
      ? `Container Infrastructure API microversions ${microversions.minimum} through ${microversions.maximum} are available.${configuredMicroversionMaximum ? ` Sunrise will not request newer than ${configuredMicroversionMaximum}.` : ""}`
      : "The Container Infrastructure API does not advertise microversion support.",
    microversions,
    serviceType: "container-infra",
  };
}

export async function discoverLoadBalancerCapabilities(
  regionId: string,
): Promise<OpenStackServiceCapabilities> {
  const configuredMicroversionMaximum = configuredApiMicroversion(
    getApiMicroversionPolicy(),
    "load-balancer",
    regionId,
  );
  const session = await getSession();
  const token = session.keystoneProjectToken;
  const endpoint = token
    ? await getServiceEndpoint(regionId, "load-balancer", "octavia", token)
    : null;
  if (!endpoint) {
    const capabilities = unavailable(
      "load-balancer",
      "Load Balancing API microversion discovery was unavailable.",
    );
    return configuredMicroversionMaximum
      ? { ...capabilities, configuredMicroversionMaximum }
      : capabilities;
  }

  const payload = await openstackRequest<unknown>({
    acceptedStatuses: [300],
    endpointOverride: unversionedRoot(endpoint, /^v2(?:\.0)?$/i),
    regionId,
    serviceType: "load-balancer",
    serviceName: "octavia",
    path: "/",
  });
  const discovery = parseAdditiveVersionDiscovery(payload, 2);

  if (!discovery?.microversions) {
    logger.warn("load-balancer-microversions-unavailable", { regionId });
    const capabilities = unavailable(
      "load-balancer",
      "Load Balancing API microversion discovery was unavailable.",
    );
    return configuredMicroversionMaximum
      ? { ...capabilities, configuredMicroversionMaximum }
      : capabilities;
  }
  const { microversions } = discovery;

  return {
    ...(configuredMicroversionMaximum ? { configuredMicroversionMaximum } : {}),
    discoveryStatus: "available",
    message: `Load Balancing API microversions ${microversions.minimum} through ${microversions.maximum} are available.${configuredMicroversionMaximum ? ` Sunrise will not request newer than ${configuredMicroversionMaximum}.` : ""}`,
    microversions,
    serviceType: "load-balancer",
  };
}

export async function discoverSharedFileSystemCapabilities(
  regionId: string,
): Promise<OpenStackServiceCapabilities> {
  const configuredMicroversionMaximum = configuredApiMicroversion(
    getApiMicroversionPolicy(),
    "share",
    regionId,
  );
  const session = await getSession();
  const token = session.keystoneProjectToken;
  const endpoint = token
    ? await getServiceEndpoint(regionId, "sharev2", "manila", token)
    : null;
  if (!endpoint) {
    const capabilities = unavailable(
      "share",
      "Shared File Systems API microversion discovery was unavailable.",
    );
    return configuredMicroversionMaximum
      ? { ...capabilities, configuredMicroversionMaximum }
      : capabilities;
  }

  const payload = await openstackRequest<unknown>({
    acceptedStatuses: [300],
    endpointOverride: versionRoot(endpoint, /^v2$/i),
    regionId,
    serviceType: "sharev2",
    serviceName: "manila",
    path: "/",
  });
  const discovery = parseMicroversionDiscovery(payload);

  if (!discovery) {
    logger.warn("shared-file-system-microversions-unavailable", { regionId });
    const capabilities = unavailable(
      "share",
      "Shared File Systems API microversion discovery was unavailable.",
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
      ? `Shared File Systems API microversions ${microversions.minimum} through ${microversions.maximum} are available.${configuredMicroversionMaximum ? ` Sunrise will not request newer than ${configuredMicroversionMaximum}.` : ""}`
      : "The Shared File Systems API does not advertise microversion support.",
    microversions,
    serviceType: "share",
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

export async function magnumDetailApiVersion(regionId?: string) {
  if (!regionId) return magnumApiVersion(MAGNUM_BASELINE_MICROVERSION);

  const capabilities =
    await discoverContainerInfrastructureCapabilities(regionId);
  const support = preferredMicroversionSupport(
    capabilities,
    MAGNUM_BASELINE_MICROVERSION,
    MAGNUM_DETAIL_MICROVERSION,
    "Extended Container Infrastructure details",
  );
  if (support.status === "unsupported") {
    throw new Error(support.message);
  }

  return magnumApiVersion(
    support.requestedMicroversion ?? MAGNUM_BASELINE_MICROVERSION,
  );
}

export async function manilaDetailApiVersion(regionId?: string) {
  if (!regionId) return MANILA_BASELINE_MICROVERSION;

  const capabilities = await discoverSharedFileSystemCapabilities(regionId);
  const support = preferredMicroversionSupport(
    capabilities,
    MANILA_BASELINE_MICROVERSION,
    MANILA_DETAIL_MICROVERSION,
    "Extended Shared File Systems details",
  );
  if (support.status === "unsupported") {
    throw new Error(support.message);
  }

  return support.requestedMicroversion ?? MANILA_BASELINE_MICROVERSION;
}

export async function discoverDeploymentCapabilities(regionId: string) {
  const [compute, containerInfra, loadBalancer, network, share, volume] =
    await Promise.all([
      discoverComputeCapabilities(regionId),
      discoverContainerInfrastructureCapabilities(regionId),
      discoverLoadBalancerCapabilities(regionId),
      discoverNetworkCapabilities(regionId),
      discoverSharedFileSystemCapabilities(regionId),
      discoverBlockStorageCapabilities(regionId),
    ]);
  return { compute, containerInfra, loadBalancer, network, share, volume };
}
