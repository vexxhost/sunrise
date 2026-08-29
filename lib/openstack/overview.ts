import "server-only";

import { redirect } from "next/navigation";
import {
  getServiceCatalog,
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from "@/lib/openstack/catalog";
import {
  parseCinderQuotaDetails,
  parseMagnumQuota,
  parseManilaQuotaDetails,
  parseNeutronLimits,
  parseNovaQuotaDetails,
  parseOctaviaQuotaDetails,
  type OctaviaQuotaUsage,
  type QuotaMetric,
} from "@/lib/openstack/quota";

export type OverviewServiceId =
  | "compute"
  | "storage"
  | "network"
  | "shared-file-system"
  | "container-infra"
  | "load-balancing";
export type OverviewServiceStatus =
  "available" | "forbidden" | "unavailable" | "error";

export type OverviewService = {
  id: OverviewServiceId;
  label: string;
  href: string;
  status: OverviewServiceStatus;
  metrics: QuotaMetric[];
  message?: string;
};

type ServiceDefinition = {
  id: OverviewServiceId;
  label: string;
  href: string;
  serviceType: string;
  serviceName: string;
  path: (projectId: string) => string;
  apiVersion?: string;
  apiVersionHeader?: string;
  parse?: (payload: unknown) => QuotaMetric[];
  kind?: "magnum" | "octavia";
};

const serviceDefinitions: ServiceDefinition[] = [
  {
    id: "compute",
    label: "Compute",
    href: "/compute/instances",
    serviceType: "compute",
    serviceName: "nova",
    path: (projectId) => `/os-quota-sets/${projectId}/detail`,
    apiVersion: "compute 2.79",
    parse: parseNovaQuotaDetails,
  },
  {
    id: "storage",
    label: "Block storage",
    href: "/compute/volumes",
    serviceType: "volumev3",
    serviceName: "cinder",
    path: (projectId) => `/os-quota-sets/${projectId}?usage=true`,
    apiVersion: "volume 3.67",
    parse: parseCinderQuotaDetails,
  },
  {
    id: "network",
    label: "Network",
    href: "/compute/networks",
    serviceType: "network",
    serviceName: "neutron",
    path: (projectId) => `/v2.0/quotas/${projectId}/details.json`,
    parse: parseNeutronLimits,
  },
  {
    id: "shared-file-system",
    label: "Shared file systems",
    href: "/file-system",
    serviceType: "sharev2",
    serviceName: "manilav2",
    path: (projectId) => `/${projectId}/quota-sets/${projectId}/detail`,
    apiVersion: "2.25",
    apiVersionHeader: "X-OpenStack-Manila-API-Version",
    parse: parseManilaQuotaDetails,
  },
  {
    id: "container-infra",
    label: "Kubernetes",
    href: "/kubernetes/clusters",
    serviceType: "container-infra",
    serviceName: "magnum",
    path: (projectId) => `/quotas/${projectId}/Cluster`,
    apiVersion: "container-infra latest",
    kind: "magnum",
  },
  {
    id: "load-balancing",
    label: "Load balancing",
    href: "/quotas",
    serviceType: "load-balancer",
    serviceName: "octavia",
    path: (projectId) => `/v2/lbaas/quotas/${projectId}`,
    kind: "octavia",
  },
];

class OpenStackRequestError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
  ) {
    super(`OpenStack request failed: ${status} ${statusText}`);
  }
}

class OpenStackConnectionError extends Error {
  constructor(readonly originalError: unknown) {
    super("OpenStack service is unreachable");
  }
}

class OpenStackPayloadError extends Error {}

function serviceUrl(endpoint: string, path: string) {
  const url = new URL(endpoint);
  const requested = new URL(path, "http://openstack.invalid");
  url.pathname = `${url.pathname.replace(/\/$/, "")}${requested.pathname}`;
  url.search = requested.search;
  return url.toString();
}

function serviceHeaders(definition: ServiceDefinition, token: string) {
  const headers: Record<string, string> = { "X-Auth-Token": token };
  if (definition.apiVersion) {
    headers[definition.apiVersionHeader ?? "OpenStack-API-Version"] =
      definition.apiVersion;
  }
  return headers;
}

async function requestJson(url: string, headers: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(url, { headers, cache: "no-store" });
  } catch (error) {
    throw new OpenStackConnectionError(error);
  }

  if (!response.ok) {
    throw new OpenStackRequestError(response.status, response.statusText);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new OpenStackPayloadError(
      error instanceof Error ? error.message : "Invalid JSON response",
    );
  }
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OpenStackPayloadError(`Invalid ${name} response`);
  }
  return value as Record<string, unknown>;
}

async function loadMagnumClusterCount(
  endpoint: string,
  headers: Record<string, string>,
  projectId: string,
) {
  const query = new URLSearchParams({ project_id: projectId });
  const payload = asRecord(
    await requestJson(serviceUrl(endpoint, `/stats?${query}`), headers),
    "Magnum project stats",
  );
  if (
    typeof payload.clusters !== "number" ||
    !Number.isInteger(payload.clusters) ||
    payload.clusters < 0
  ) {
    throw new OpenStackPayloadError("Invalid Magnum cluster usage");
  }
  return payload.clusters;
}

type OctaviaCollection =
  "loadbalancers" | "listeners" | "pools" | "healthmonitors" | "l7policies";

async function loadOctaviaCollection(
  endpoint: string,
  headers: Record<string, string>,
  projectId: string,
  collection: OctaviaCollection,
) {
  const endpointOrigin = new URL(endpoint).origin;
  const visited = new Set<string>();
  const query = new URLSearchParams({
    limit: "100",
    project_id: projectId,
  });
  let next: string | undefined = serviceUrl(
    endpoint,
    `/v2/lbaas/${collection}?${query}`,
  );
  const items: Record<string, unknown>[] = [];

  while (next) {
    const pageUrl = new URL(next, endpoint);
    if (pageUrl.origin !== endpointOrigin) {
      throw new OpenStackPayloadError(
        "Octavia pagination crossed the catalog endpoint origin",
      );
    }
    if (visited.has(pageUrl.href) || visited.size >= 100) {
      throw new OpenStackPayloadError("Invalid Octavia pagination");
    }
    visited.add(pageUrl.href);

    const payload = asRecord(
      await requestJson(pageUrl.href, headers),
      `Octavia ${collection} list`,
    );
    const pageItems = payload[collection];
    if (!Array.isArray(pageItems)) {
      throw new OpenStackPayloadError(`Invalid Octavia ${collection} list`);
    }
    items.push(
      ...pageItems.map((item) => asRecord(item, `Octavia ${collection} item`)),
    );

    const links = payload[`${collection}_links`];
    if (links === undefined || links === null) {
      next = undefined;
      continue;
    }
    if (!Array.isArray(links)) {
      throw new OpenStackPayloadError(`Invalid Octavia ${collection} links`);
    }
    const nextLink = links
      .map((link) => asRecord(link, `Octavia ${collection} link`))
      .find((link) => link.rel === "next");
    if (!nextLink) {
      next = undefined;
    } else if (typeof nextLink.href === "string" && nextLink.href !== "") {
      next = nextLink.href;
    } else {
      throw new OpenStackPayloadError(
        `Invalid Octavia ${collection} next page`,
      );
    }
  }

  return items;
}

function nestedOctaviaCount(
  items: Record<string, unknown>[],
  field: "members" | "rules",
) {
  return items.reduce((count, item) => {
    const nested = item[field];
    if (!Array.isArray(nested)) {
      throw new OpenStackPayloadError(`Invalid Octavia ${field} list`);
    }
    return count + nested.length;
  }, 0);
}

async function loadOctaviaMetrics(
  definition: ServiceDefinition,
  endpoint: string,
  headers: Record<string, string>,
  projectId: string,
) {
  const [
    projectQuota,
    defaultQuota,
    loadbalancers,
    listeners,
    pools,
    healthmonitors,
    l7policies,
  ] = await Promise.all([
    requestJson(serviceUrl(endpoint, definition.path(projectId)), headers),
    requestJson(
      serviceUrl(endpoint, `/v2/lbaas/quotas/${projectId}/default`),
      headers,
    ),
    loadOctaviaCollection(endpoint, headers, projectId, "loadbalancers"),
    loadOctaviaCollection(endpoint, headers, projectId, "listeners"),
    loadOctaviaCollection(endpoint, headers, projectId, "pools"),
    loadOctaviaCollection(endpoint, headers, projectId, "healthmonitors"),
    loadOctaviaCollection(endpoint, headers, projectId, "l7policies"),
  ]);
  const usage: OctaviaQuotaUsage = {
    loadbalancer: loadbalancers.length,
    listener: listeners.length,
    pool: pools.length,
    member: nestedOctaviaCount(pools, "members"),
    healthmonitor: healthmonitors.length,
    l7policy: l7policies.length,
    l7rule: nestedOctaviaCount(l7policies, "rules"),
  };

  return parseOctaviaQuotaDetails(projectQuota, defaultQuota, usage);
}

async function loadMetrics(
  definition: ServiceDefinition,
  endpoint: string,
  token: string,
  projectId: string,
) {
  const headers = serviceHeaders(definition, token);
  if (definition.kind === "magnum") {
    const [quota, clusterCount] = await Promise.all([
      requestJson(serviceUrl(endpoint, definition.path(projectId)), headers),
      loadMagnumClusterCount(endpoint, headers, projectId),
    ]);
    return parseMagnumQuota(quota, clusterCount);
  }
  if (definition.kind === "octavia") {
    return loadOctaviaMetrics(definition, endpoint, headers, projectId);
  }

  if (!definition.parse) {
    throw new OpenStackPayloadError("Quota parser is unavailable");
  }
  const payload = await requestJson(
    serviceUrl(endpoint, definition.path(projectId)),
    headers,
  );
  return definition.parse(payload);
}

function unavailableService(
  definition: ServiceDefinition,
  message: string,
): OverviewService {
  return {
    id: definition.id,
    label: definition.label,
    href: definition.href,
    status: "unavailable",
    metrics: [],
    message,
  };
}

async function loadService(
  definition: ServiceDefinition,
  catalog: OpenStackCatalogService[],
  token: string,
  regionId: string,
  projectId: string,
): Promise<OverviewService> {
  const endpoint = resolveServiceEndpoint(
    catalog,
    regionId,
    definition.serviceType,
    definition.serviceName,
  );
  if (!endpoint) {
    return unavailableService(definition, `Not available in ${regionId}`);
  }

  try {
    return {
      id: definition.id,
      label: definition.label,
      href: definition.href,
      status: "available",
      metrics: await loadMetrics(definition, endpoint, token, projectId),
    };
  } catch (error) {
    if (error instanceof OpenStackRequestError) {
      if (error.status === 401) {
        redirect("/auth/logout?reason=expired");
      }
      if (error.status === 403) {
        return {
          ...unavailableService(definition, "Quota details require permission"),
          status: "forbidden",
        };
      }
      console.error(`[overview/${definition.id}] quota request failed`, {
        status: error.status,
        statusText: error.statusText,
      });
      return {
        ...unavailableService(definition, "Quota details are unavailable"),
        status: error.status === 404 ? "unavailable" : "error",
      };
    }
    if (error instanceof OpenStackConnectionError) {
      console.error(`[overview/${definition.id}] request failed`, {
        error: error.originalError,
      });
      return {
        ...unavailableService(definition, "Temporarily unreachable"),
        status: "error",
      };
    }
    console.error(`[overview/${definition.id}] invalid quota response`, {
      error,
    });
    return {
      ...unavailableService(definition, "Quota response was not recognized"),
      status: "error",
    };
  }
}

export async function loadProjectOverview({
  token,
  regionId,
  projectId,
}: {
  token?: string;
  regionId?: string;
  projectId?: string;
}): Promise<OverviewService[]> {
  if (!token || !regionId || !projectId) {
    return serviceDefinitions.map((definition) =>
      unavailableService(definition, "Select a project and region"),
    );
  }

  const catalog = await getServiceCatalog(token);
  if (!catalog) {
    return serviceDefinitions.map((definition) =>
      unavailableService(definition, "Service catalog is unavailable"),
    );
  }

  return Promise.all(
    serviceDefinitions.map((definition) =>
      loadService(definition, catalog, token, regionId, projectId),
    ),
  );
}
