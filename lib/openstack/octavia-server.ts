import "server-only";

import { openstackRequest } from "@/lib/openstack/request-server";
import { OpenStackRequestError } from "@/lib/openstack/request";
import {
  discoverLoadBalancerCapabilities,
  OCTAVIA_AVAILABILITY_ZONE_MICROVERSION,
} from "@/lib/openstack/capabilities-server";
import {
  microversionSupport,
  type OpenStackFeatureSupport,
} from "@/lib/openstack/capabilities";
import { getSession } from "@/lib/session";
import type {
  OctaviaAvailabilityZone,
  OctaviaHealthMonitor,
  OctaviaL7Policy,
  OctaviaL7Rule,
  OctaviaListener,
  OctaviaLoadBalancer,
  OctaviaLoadBalancerDetails,
  OctaviaLoadBalancerStats,
  OctaviaMember,
  OctaviaPool,
  OctaviaStatusNode,
} from "@/types/openstack";

const SERVICE_TYPE = "load-balancer";
const SERVICE_NAME = "octavia";
const COLLECTION_PAGE_SIZE = 100;
const MAX_COLLECTION_PAGES = 100;
const OCTAVIA_API_PATH = "/v2/lbaas/";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OctaviaScope = {
  projectId: string;
  regionId: string;
};

type CollectionResponse<T> = Record<string, unknown> & {
  [key: string]: T[] | unknown;
};

function normalizeProjectId(value: string) {
  return value.replaceAll("-", "").toLowerCase();
}

function requireUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new OpenStackRequestError(404, `${label} not found`);
  }
  return value;
}

async function resolveScope(
  regionId?: string,
  projectId?: string,
): Promise<OctaviaScope> {
  const session = await getSession();
  if (!session.regionId || !session.projectId) {
    throw new Error("No active project scope for Octavia request");
  }
  if (regionId && regionId !== session.regionId) {
    throw new Error("Octavia region does not match the active session");
  }
  if (
    projectId &&
    normalizeProjectId(projectId) !== normalizeProjectId(session.projectId)
  ) {
    throw new Error("Octavia project does not match the active session");
  }
  return { regionId: session.regionId, projectId: session.projectId };
}

function collectionPath(
  collection: string,
  projectId: string,
  filters: Record<string, string> = {},
) {
  const query = new URLSearchParams({
    limit: String(COLLECTION_PAGE_SIZE),
    project_id: projectId,
    ...filters,
  });
  return `/v2/lbaas/${collection}?${query}`;
}

function nestedCollectionPath(
  path: string,
  filters: Record<string, string> = {},
) {
  const query = new URLSearchParams({
    limit: String(COLLECTION_PAGE_SIZE),
    ...filters,
  });
  return `${path}?${query}`;
}

function nextCollectionPath(links: unknown, collection: string): string | null {
  if (links === undefined || links === null) return null;
  if (!Array.isArray(links)) {
    throw new Error(`Invalid Octavia ${collection} pagination links`);
  }

  const next = links.find((link): link is { href: string; rel: string } =>
    Boolean(
      link &&
      typeof link === "object" &&
      "rel" in link &&
      link.rel === "next" &&
      "href" in link &&
      typeof link.href === "string",
    ),
  );
  if (!next) return null;

  const url = new URL(next.href, "https://octavia.invalid");
  const apiPathIndex = url.pathname.indexOf(OCTAVIA_API_PATH);
  if (apiPathIndex < 0) {
    throw new Error(`Invalid Octavia ${collection} pagination target`);
  }
  return `${url.pathname.slice(apiPathIndex)}${url.search}`;
}

async function octaviaGet<T>(
  scope: OctaviaScope,
  path: string,
  errorMode: "return-null" | "throw" = "throw",
  apiVersion?: string,
) {
  return openstackRequest<T>({
    regionId: scope.regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path,
    apiVersion,
    errorMode,
  });
}

function parseAvailabilityZones(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const zones = (payload as { availability_zones?: unknown })
    .availability_zones;
  if (!Array.isArray(zones)) return null;

  const parsed: OctaviaAvailabilityZone[] = [];
  for (const value of zones) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const zone = value as Record<string, unknown>;
    if (
      typeof zone.name !== "string" ||
      !zone.name.trim() ||
      typeof zone.enabled !== "boolean" ||
      (zone.description !== undefined &&
        zone.description !== null &&
        typeof zone.description !== "string")
    ) {
      return null;
    }
    parsed.push({
      name: zone.name,
      enabled: zone.enabled,
      ...(typeof zone.description === "string"
        ? { description: zone.description }
        : {}),
    });
  }
  return parsed;
}

export type OctaviaAvailabilityZoneResult = {
  availabilityZones: OctaviaAvailabilityZone[];
  support: OpenStackFeatureSupport;
};

export async function listLoadBalancerAvailabilityZones(
  regionId?: string,
  projectId?: string,
): Promise<OctaviaAvailabilityZoneResult> {
  const scope = await resolveScope(regionId, projectId);
  const capabilities = await discoverLoadBalancerCapabilities(scope.regionId);
  const support = microversionSupport(
    capabilities,
    OCTAVIA_AVAILABILITY_ZONE_MICROVERSION,
    "Load balancer availability-zone selection",
  );
  if (support.status === "unsupported") {
    return { availabilityZones: [], support };
  }

  const requestedMicroversion =
    support.requestedMicroversion ?? OCTAVIA_AVAILABILITY_ZONE_MICROVERSION;
  const payload = await octaviaGet<unknown>(
    scope,
    "/v2/lbaas/availabilityzones",
    "return-null",
    `load-balancer ${requestedMicroversion}`,
  );
  const availabilityZones = parseAvailabilityZones(payload);
  if (!availabilityZones) {
    return {
      availabilityZones: [],
      support: {
        status: "unknown",
        message:
          "Load balancer availability zones could not be loaded for the active project.",
      },
    };
  }

  return {
    availabilityZones: availabilityZones
      .filter(({ enabled }) => enabled)
      .sort((left, right) => left.name.localeCompare(right.name)),
    support:
      support.status === "unknown"
        ? {
            status: "supported",
            requestedMicroversion,
            message:
              "Load balancer availability zones are supported by the active cloud.",
          }
        : support,
  };
}

async function listCollection<T>(
  scope: OctaviaScope,
  collection: string,
  initialPath: string,
): Promise<T[]> {
  const items: T[] = [];
  const visited = new Set<string>();
  let path: string | null = initialPath;

  while (path) {
    if (visited.has(path) || visited.size >= MAX_COLLECTION_PAGES) {
      throw new Error(`Invalid Octavia ${collection} pagination`);
    }
    visited.add(path);

    const payload = await octaviaGet<CollectionResponse<T>>(
      scope,
      path,
      "throw",
    );
    const page = payload?.[collection];
    if (!Array.isArray(page)) {
      throw new Error(`Invalid Octavia ${collection} response`);
    }
    items.push(...(page as T[]));
    path = nextCollectionPath(payload?.[`${collection}_links`], collection);
  }

  return items;
}

function belongsToProject(resourceProjectId: unknown, projectId: string) {
  return (
    typeof resourceProjectId === "string" &&
    normalizeProjectId(resourceProjectId) === normalizeProjectId(projectId)
  );
}

function relatedResourceIds(
  values: Array<string | null | undefined>,
  label: string,
) {
  const ids = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (!UUID_PATTERN.test(value)) {
      throw new Error(`Invalid Octavia ${label} reference`);
    }
    ids.add(value);
  }
  return [...ids];
}

function referenceIds(
  references: Array<{ id: string }> | undefined,
  label: string,
) {
  if (!references) return [];
  if (
    references.some(
      (reference) =>
        !reference ||
        typeof reference.id !== "string" ||
        !UUID_PATTERN.test(reference.id),
    )
  ) {
    throw new Error(`Invalid Octavia ${label} reference`);
  }
  return relatedResourceIds(
    references.map(({ id }) => id),
    label,
  );
}

async function getProjectResource<T extends { project_id: string }>(
  scope: OctaviaScope,
  collection: string,
  responseKey: string,
  id: string,
): Promise<T> {
  if (!UUID_PATTERN.test(id)) {
    throw new Error(`Invalid Octavia ${collection} reference`);
  }
  const payload = await octaviaGet<Record<string, T>>(
    scope,
    `/v2/lbaas/${collection}/${encodeURIComponent(id)}`,
    "throw",
  );
  const resource = payload?.[responseKey];
  if (!resource || !belongsToProject(resource.project_id, scope.projectId)) {
    throw new OpenStackRequestError(404, `${responseKey} not found`);
  }
  return resource;
}

export async function listLoadBalancers(
  regionId?: string,
  projectId?: string,
): Promise<OctaviaLoadBalancer[]> {
  const scope = await resolveScope(regionId, projectId);
  const loadBalancers = await listCollection<OctaviaLoadBalancer>(
    scope,
    "loadbalancers",
    collectionPath("loadbalancers", scope.projectId),
  );

  return loadBalancers
    .filter((loadBalancer) =>
      belongsToProject(loadBalancer.project_id, scope.projectId),
    )
    .sort((left, right) =>
      (left.name || left.id).localeCompare(right.name || right.id),
    );
}

export async function getLoadBalancerDetails(
  id: string,
  regionId?: string,
  projectId?: string,
): Promise<OctaviaLoadBalancerDetails> {
  const loadBalancerId = requireUuid(id, "load balancer ID");
  const scope = await resolveScope(regionId, projectId);
  const loadBalancerPayload = await octaviaGet<{
    loadbalancer: OctaviaLoadBalancer;
  }>(
    scope,
    `/v2/lbaas/loadbalancers/${encodeURIComponent(loadBalancerId)}`,
    "throw",
  );
  const loadBalancer = loadBalancerPayload?.loadbalancer;
  if (
    !loadBalancer ||
    !belongsToProject(loadBalancer.project_id, scope.projectId)
  ) {
    throw new OpenStackRequestError(404, "Load balancer not found");
  }

  const listenerIds = referenceIds(loadBalancer.listeners, "listener");
  const loadBalancerPoolIds = referenceIds(loadBalancer.pools, "pool");
  const [listeners, stats, status] = await Promise.all([
    Promise.all(
      listenerIds.map((listenerId) =>
        getProjectResource<OctaviaListener>(
          scope,
          "listeners",
          "listener",
          listenerId,
        ),
      ),
    ),
    octaviaGet<{ stats: OctaviaLoadBalancerStats }>(
      scope,
      `/v2/lbaas/loadbalancers/${encodeURIComponent(loadBalancerId)}/stats`,
      "return-null",
    ),
    octaviaGet<{ statuses: { loadbalancer: OctaviaStatusNode } }>(
      scope,
      `/v2/lbaas/loadbalancers/${encodeURIComponent(loadBalancerId)}/status`,
      "return-null",
    ),
  ]);

  const poolIds = relatedResourceIds(
    [
      ...loadBalancerPoolIds,
      ...listeners.map(({ default_pool_id: poolId }) => poolId),
    ],
    "pool",
  );
  const l7PolicyIds = referenceIds(
    listeners.flatMap(({ l7policies = [] }) => l7policies),
    "L7 policy",
  );
  const [initialPools, l7Policies] = await Promise.all([
    Promise.all(
      poolIds.map((poolId) =>
        getProjectResource<OctaviaPool>(scope, "pools", "pool", poolId),
      ),
    ),
    Promise.all(
      l7PolicyIds.map((policyId) =>
        getProjectResource<OctaviaL7Policy>(
          scope,
          "l7policies",
          "l7policy",
          policyId,
        ),
      ),
    ),
  ]);
  const initialPoolIds = new Set(initialPools.map(({ id: poolId }) => poolId));
  const redirectPoolIds = relatedResourceIds(
    l7Policies.map(({ redirect_pool_id: poolId }) => poolId),
    "pool",
  ).filter((poolId) => !initialPoolIds.has(poolId));
  const redirectPools = await Promise.all(
    redirectPoolIds.map((poolId) =>
      getProjectResource<OctaviaPool>(scope, "pools", "pool", poolId),
    ),
  );
  const pools = [...initialPools, ...redirectPools];
  const healthMonitorIds = relatedResourceIds(
    pools.map(({ healthmonitor_id: healthMonitorId }) => healthMonitorId),
    "health monitor",
  );
  const healthMonitorsPromise = Promise.all(
    healthMonitorIds.map((healthMonitorId) =>
      getProjectResource<OctaviaHealthMonitor>(
        scope,
        "healthmonitors",
        "healthmonitor",
        healthMonitorId,
      ),
    ),
  );

  const [healthMonitors, memberLists, ruleLists] = await Promise.all([
    healthMonitorsPromise,
    Promise.all(
      pools.map(async (pool) => {
        const members = await listCollection<OctaviaMember>(
          scope,
          "members",
          nestedCollectionPath(
            `/v2/lbaas/pools/${encodeURIComponent(pool.id)}/members`,
          ),
        );
        return members.map((member) => ({ ...member, pool_id: pool.id }));
      }),
    ),
    Promise.all(
      l7Policies.map(async (policy) => {
        const rules = await listCollection<OctaviaL7Rule>(
          scope,
          "rules",
          nestedCollectionPath(
            `/v2/lbaas/l7policies/${encodeURIComponent(policy.id)}/rules`,
          ),
        );
        return rules.map((rule) => ({ ...rule, l7policy_id: policy.id }));
      }),
    ),
  ]);

  return {
    loadBalancer,
    stats: stats?.stats ?? null,
    statusTree: status?.statuses?.loadbalancer ?? null,
    listeners,
    pools,
    members: memberLists.flat(),
    healthMonitors,
    l7Policies,
    l7Rules: ruleLists.flat(),
  };
}
