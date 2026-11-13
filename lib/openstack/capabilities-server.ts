import "server-only";

import { createLogger } from "@/lib/logging";
import {
  parseExtensionAliases,
  parseMicroversionRange,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getServiceEndpoint } from "@/lib/openstack/catalog";
import { getSession } from "@/lib/session";

const logger = createLogger("openstack.capabilities");

export const NOVA_VOLUME_ATTACHMENT_UPDATE_MICROVERSION = "2.85";
export const NEUTRON_EXTRA_ROUTE_EXTENSION = "extraroute";

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
  const session = await getSession();
  const token = session.keystoneProjectToken;
  const endpoint = token
    ? await getServiceEndpoint(regionId, "compute", "nova", token)
    : null;
  if (!endpoint) {
    return unavailable(
      "compute",
      "Compute API microversion discovery was unavailable.",
    );
  }
  const payload = await openstackRequest<unknown>({
    acceptedStatuses: [300],
    endpointOverride: versionRoot(endpoint, /^v2(?:\.1)?$/i),
    regionId,
    serviceType: "compute",
    serviceName: "nova",
    path: "/",
  });
  const microversions = parseMicroversionRange(payload);

  if (!microversions) {
    logger.warn("compute-microversions-unavailable", { regionId });
    return unavailable(
      "compute",
      "Compute API microversion discovery was unavailable.",
    );
  }

  return {
    discoveryStatus: "available",
    message: `Compute API microversions ${microversions.minimum} through ${microversions.maximum} are available.`,
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

export async function discoverDeploymentCapabilities(regionId: string) {
  const [compute, network] = await Promise.all([
    discoverComputeCapabilities(regionId),
    discoverNetworkCapabilities(regionId),
  ]);
  return { compute, network };
}
