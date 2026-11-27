import "server-only";

import { z } from "zod";
import { openstackRequest } from "@/lib/openstack/request-server";
import {
  isOpenStackNotFoundError,
  OpenStackConnectionError,
  OpenStackRequestError,
} from "@/lib/openstack/request";
import {
  discoverLoadBalancerCapabilities,
  OCTAVIA_AVAILABILITY_ZONE_MICROVERSION,
  OCTAVIA_TAGS_MICROVERSION,
} from "@/lib/openstack/capabilities-server";
import {
  microversionSupport,
  type OpenStackFeatureSupport,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";
import {
  listenerParentReadApiVersion,
  listenerReadApiVersion,
} from "@/lib/openstack/octavia-listener-settings";
import { healthMonitorBelongsToPool } from "@/lib/openstack/octavia-health-monitor-settings";
import { getSession } from "@/lib/session";
import type {
  OctaviaAvailabilityZone,
  OctaviaHealthMonitor,
  OctaviaL7Policy,
  OctaviaL7Rule,
  OctaviaListener,
  OctaviaLoadBalancer,
  OctaviaLoadBalancerDetails,
  OctaviaMember,
  OctaviaPool,
  OctaviaPoolRedirectPolicy,
  OctaviaStatusNode,
  OctaviaTrafficStats,
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

const trafficCounter = z
  .number()
  .int()
  .nonnegative()
  .optional()
  .catch(undefined);
const trafficStatsResponse = z.object({
  stats: z.object({
    active_connections: trafficCounter,
    bytes_in: trafficCounter,
    bytes_out: trafficCounter,
    request_errors: trafficCounter,
    total_connections: trafficCounter,
  }),
});

async function readTrafficStats(
  scope: OctaviaScope,
  collection: "listeners" | "loadbalancers",
  id: string,
): Promise<OctaviaTrafficStats | null> {
  const payload = await octaviaGet<unknown>(
    scope,
    `/v2/lbaas/${collection}/${encodeURIComponent(id)}/stats`,
    "return-null",
  );
  const parsed = trafficStatsResponse.safeParse(payload);
  return parsed.success &&
    Object.values(parsed.data.stats).some((counter) => counter !== undefined)
    ? parsed.data.stats
    : null;
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
  apiVersion?: string,
  filters?: URLSearchParams,
): Promise<T[]> {
  const items: T[] = [];
  const visited = new Set<string>();
  const collectionPathname = initialPath.split("?")[0];
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
      apiVersion,
    );
    const page = payload?.[collection];
    if (!Array.isArray(page)) {
      throw new Error(`Invalid Octavia ${collection} response`);
    }
    items.push(...(page as T[]));
    const next = nextCollectionPath(
      payload?.[`${collection}_links`],
      collection,
    );
    if (next && next.split("?")[0] !== collectionPathname) {
      throw new Error(`Invalid Octavia ${collection} pagination target`);
    }
    if (next && filters) {
      // Octavia's next links may omit collection filters.
      const url = new URL(next, "https://octavia.invalid");
      for (const [key, value] of filters) url.searchParams.set(key, value);
      path = `${url.pathname}${url.search}`;
    } else {
      path = next;
    }
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
  apiVersion?: string,
): Promise<T> {
  if (!UUID_PATTERN.test(id)) {
    throw new Error(`Invalid Octavia ${collection} reference`);
  }
  const payload = await octaviaGet<Record<string, T>>(
    scope,
    `/v2/lbaas/${collection}/${encodeURIComponent(id)}`,
    "throw",
    apiVersion,
  );
  const resource = payload?.[responseKey];
  if (!resource || !belongsToProject(resource.project_id, scope.projectId)) {
    throw new OpenStackRequestError(404, `${responseKey} not found`);
  }
  return resource;
}

async function loadBalancerTagsApiVersion(
  scope: OctaviaScope,
  knownCapabilities?: OpenStackServiceCapabilities,
) {
  const capabilities =
    knownCapabilities ??
    (await discoverLoadBalancerCapabilities(scope.regionId));
  const support = microversionSupport(
    capabilities,
    OCTAVIA_TAGS_MICROVERSION,
    "Load balancer tags",
  );
  return {
    apiVersion:
      support.status === "unsupported"
        ? undefined
        : `load-balancer ${support.requestedMicroversion ?? OCTAVIA_TAGS_MICROVERSION}`,
    fallbackAllowed: support.status === "unknown",
  };
}

function isUnsupportedMicroversion(error: unknown) {
  return (
    error instanceof OpenStackRequestError &&
    (error.status === 400 || error.status === 406)
  );
}

async function listLoadBalancersWithTags(
  scope: OctaviaScope,
  apiVersion?: string,
  fallbackAllowed = false,
) {
  const path = collectionPath("loadbalancers", scope.projectId);
  try {
    return await listCollection<OctaviaLoadBalancer>(
      scope,
      "loadbalancers",
      path,
      apiVersion,
    );
  } catch (error) {
    if (!fallbackAllowed || !apiVersion || !isUnsupportedMicroversion(error)) {
      throw error;
    }
    return listCollection<OctaviaLoadBalancer>(scope, "loadbalancers", path);
  }
}

async function getLoadBalancerWithTags(
  scope: OctaviaScope,
  id: string,
  apiVersion?: string,
  fallbackAllowed = false,
) {
  try {
    return await getProjectResource<OctaviaLoadBalancer>(
      scope,
      "loadbalancers",
      "loadbalancer",
      id,
      apiVersion,
    );
  } catch (error) {
    if (!fallbackAllowed || !apiVersion || !isUnsupportedMicroversion(error)) {
      throw error;
    }
    return getProjectResource<OctaviaLoadBalancer>(
      scope,
      "loadbalancers",
      "loadbalancer",
      id,
    );
  }
}

export async function listLoadBalancers(
  regionId?: string,
  projectId?: string,
): Promise<OctaviaLoadBalancer[]> {
  const scope = await resolveScope(regionId, projectId);
  const tagsRead = await loadBalancerTagsApiVersion(scope);
  const loadBalancers = await listLoadBalancersWithTags(
    scope,
    tagsRead.apiVersion,
    tagsRead.fallbackAllowed,
  );

  return loadBalancers
    .filter((loadBalancer) =>
      belongsToProject(loadBalancer.project_id, scope.projectId),
    )
    .sort((left, right) =>
      (left.name || left.id).localeCompare(right.name || right.id),
    );
}

export async function getLoadBalancer(
  id: string,
  regionId?: string,
  projectId?: string,
  listenerCapabilities?: OpenStackServiceCapabilities,
): Promise<OctaviaLoadBalancer> {
  const loadBalancerId = requireUuid(id, "load balancer ID");
  const scope = await resolveScope(regionId, projectId);
  return readLoadBalancer(scope, loadBalancerId, listenerCapabilities);
}

async function readLoadBalancer(
  scope: OctaviaScope,
  loadBalancerId: string,
  listenerCapabilities?: OpenStackServiceCapabilities,
) {
  const tagsRead = await loadBalancerTagsApiVersion(
    scope,
    listenerCapabilities,
  );
  const advancedVersion =
    listenerCapabilities && listenerParentReadApiVersion(listenerCapabilities);
  return getLoadBalancerWithTags(
    scope,
    loadBalancerId,
    advancedVersion ?? tagsRead.apiVersion,
    !advancedVersion && tagsRead.fallbackAllowed,
  );
}

export async function getLoadBalancerListener(
  loadBalancerId: string,
  id: string,
  regionId?: string,
  projectId?: string,
  apiVersion?: string,
): Promise<OctaviaListener> {
  const parentId = requireUuid(loadBalancerId, "load balancer ID");
  const listenerId = requireUuid(id, "listener ID");
  const scope = await resolveScope(regionId, projectId);
  return readListener(scope, parentId, listenerId, apiVersion);
}

async function readListener(
  scope: OctaviaScope,
  parentId: string,
  listenerId: string,
  apiVersion?: string,
) {
  const listener = await getProjectResource<OctaviaListener>(
    scope,
    "listeners",
    "listener",
    listenerId,
    apiVersion,
  );
  if (
    listener.id !== listenerId ||
    !listenerBelongsToLoadBalancer(listener, parentId)
  ) {
    throw new OpenStackRequestError(
      404,
      "Listener not found on this load balancer",
    );
  }
  return listener;
}

function listenerBelongsToLoadBalancer(
  listener: Pick<OctaviaListener, "loadbalancers">,
  parentId: string,
) {
  return (
    Array.isArray(listener.loadbalancers) &&
    listener.loadbalancers.length === 1 &&
    listener.loadbalancers[0]?.id === parentId
  );
}

export async function getLoadBalancerListenerDetails(
  loadBalancerId: string,
  id: string,
  regionId?: string,
  projectId?: string,
) {
  const parentId = requireUuid(
    loadBalancerId,
    "load balancer ID",
  ).toLowerCase();
  const listenerId = requireUuid(id, "listener ID").toLowerCase();
  const scope = await resolveScope(regionId, projectId);
  const capabilities = await discoverLoadBalancerCapabilities(scope.regionId);
  const [loadBalancer, listener] = await Promise.all([
    readLoadBalancer(scope, parentId, capabilities),
    readListener(
      scope,
      parentId,
      listenerId,
      listenerReadApiVersion(capabilities),
    ),
  ]);
  if (loadBalancer.id !== parentId) {
    throw new OpenStackRequestError(404, "Load balancer not found");
  }
  const stats = await readTrafficStats(scope, "listeners", listenerId);
  return { loadBalancer, listener, capabilities, stats };
}

export async function getLoadBalancerPool(
  loadBalancerId: string,
  id: string,
  regionId?: string,
  projectId?: string,
): Promise<OctaviaPool> {
  const parentId = requireUuid(loadBalancerId, "load balancer ID");
  const poolId = requireUuid(id, "pool ID");
  const scope = await resolveScope(regionId, projectId);
  return readPool(scope, parentId, poolId);
}

async function readPool(scope: OctaviaScope, parentId: string, poolId: string) {
  const pool = await getProjectResource<OctaviaPool>(
    scope,
    "pools",
    "pool",
    poolId,
  );
  if (pool.id !== poolId || !poolBelongsToLoadBalancer(pool, parentId)) {
    throw new OpenStackRequestError(
      404,
      "Pool not found on this load balancer",
    );
  }
  return pool;
}

async function readPoolMembers(scope: OctaviaScope, poolId: string) {
  const members = await listCollection<OctaviaMember>(
    scope,
    "members",
    nestedCollectionPath(
      `/v2/lbaas/pools/${encodeURIComponent(poolId)}/members`,
    ),
  );
  return members
    .filter(
      (member) =>
        belongsToProject(member?.project_id, scope.projectId) &&
        (member.pool_id === undefined || member.pool_id === poolId),
    )
    .map((member) => ({ ...member, pool_id: poolId }));
}

async function optionalPoolChild<T>(request: Promise<T>) {
  try {
    return await request;
  } catch (error) {
    if (isOpenStackNotFoundError(error)) return null;
    throw error;
  }
}

export async function getLoadBalancerPoolDetails(
  loadBalancerId: string,
  id: string,
  regionId?: string,
  projectId?: string,
) {
  const parentId = requireUuid(
    loadBalancerId,
    "load balancer ID",
  ).toLowerCase();
  const poolId = requireUuid(id, "pool ID").toLowerCase();
  const scope = await resolveScope(regionId, projectId);
  const [loadBalancer, pool] = await Promise.all([
    getProjectResource<OctaviaLoadBalancer>(
      scope,
      "loadbalancers",
      "loadbalancer",
      parentId,
    ),
    readPool(scope, parentId, poolId),
  ]);
  if (loadBalancer.id !== parentId) {
    throw new OpenStackRequestError(404, "Load balancer not found");
  }

  const monitorId = relatedResourceIds(
    [pool.healthmonitor_id],
    "health monitor",
  )[0];
  const [memberList, listenerList, healthMonitor] = await Promise.all([
    optionalPoolChild(readPoolMembers(scope, poolId)),
    Promise.all(
      referenceIds(pool.listeners, "listener").map((listenerId) =>
        optionalPoolChild(readListener(scope, parentId, listenerId)),
      ),
    ),
    monitorId
      ? optionalPoolChild(readPoolHealthMonitor(scope, poolId, monitorId))
      : null,
  ]);

  return {
    loadBalancer,
    pool,
    members: memberList,
    listeners: listenerList,
    healthMonitor,
  };
}

export async function getOctaviaPoolMember(
  poolId: string,
  id: string,
  regionId?: string,
  projectId?: string,
): Promise<OctaviaMember> {
  const parentId = requireUuid(poolId, "pool ID");
  const memberId = requireUuid(id, "member ID");
  const scope = await resolveScope(regionId, projectId);
  const payload = await octaviaGet<{
    member: Omit<OctaviaMember, "pool_id"> & { pool_id?: string };
  }>(scope, `/v2/lbaas/pools/${parentId}/members/${memberId}`);
  const member = payload?.member;
  if (
    member?.id !== memberId ||
    !belongsToProject(member.project_id, scope.projectId) ||
    (member.pool_id !== undefined && member.pool_id !== parentId)
  ) {
    throw new OpenStackRequestError(404, "Member not found in this pool");
  }
  return { ...member, pool_id: parentId };
}

async function readPoolHealthMonitor(
  scope: OctaviaScope,
  poolId: string,
  monitorId: string,
) {
  const monitor = await getProjectResource<OctaviaHealthMonitor>(
    scope,
    "healthmonitors",
    "healthmonitor",
    monitorId,
  );
  if (
    monitor.id !== monitorId ||
    !healthMonitorBelongsToPool(monitor, poolId)
  ) {
    throw new OpenStackRequestError(
      404,
      "Health monitor not found in this pool",
    );
  }
  return monitor;
}

export async function getOctaviaPoolHealthMonitor(
  poolId: string,
  id: string,
  regionId?: string,
  projectId?: string,
) {
  const parentId = requireUuid(poolId, "pool ID");
  const monitorId = requireUuid(id, "health monitor ID");
  const scope = await resolveScope(regionId, projectId);
  return readPoolHealthMonitor(scope, parentId, monitorId);
}

function poolBelongsToLoadBalancer(pool: OctaviaPool, parentId: string) {
  return (
    Array.isArray(pool.loadbalancers) &&
    pool.loadbalancers.length === 1 &&
    pool.loadbalancers[0]?.id === parentId
  );
}

export async function listLoadBalancerPoolChoices(
  id: string,
  regionId?: string,
  projectId?: string,
) {
  const parentId = requireUuid(id, "load balancer ID").toLowerCase();
  const scope = await resolveScope(regionId, projectId);
  const parent = await getProjectResource<OctaviaLoadBalancer>(
    scope,
    "loadbalancers",
    "loadbalancer",
    parentId,
  );
  if (parent.id !== parentId) {
    throw new OpenStackRequestError(404, "Load balancer not found");
  }
  const poolIds = new Set(referenceIds(parent.pools, "pool"));
  if (!poolIds.size) return [];
  const filters = { project_id: scope.projectId, loadbalancer_id: parentId };
  const pools = await listCollection<OctaviaPool>(
    scope,
    "pools",
    collectionPath("pools", scope.projectId, filters),
    undefined,
    new URLSearchParams(filters),
  );
  return pools
    .filter(
      (pool) =>
        poolIds.has(pool.id) &&
        belongsToProject(pool.project_id, scope.projectId) &&
        poolBelongsToLoadBalancer(pool, parentId),
    )
    .map(
      ({
        id,
        name,
        protocol,
        provisioning_status,
        admin_state_up,
        members,
      }) => ({
        id,
        name,
        protocol,
        provisioning_status,
        admin_state_up,
        memberCount: members?.length,
      }),
    )
    .sort(
      (a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id) ||
        a.id.localeCompare(b.id),
    );
}

export async function listOctaviaPoolRedirectPolicies(
  id: string,
  regionId?: string,
  projectId?: string,
): Promise<OctaviaL7Policy[]> {
  const poolId = requireUuid(id, "pool ID");
  const scope = await resolveScope(regionId, projectId);
  return readPoolRedirectPolicies(scope, poolId);
}

export async function listLoadBalancerPoolRedirectPolicies(
  loadBalancerId: string,
  id: string,
  regionId: string,
  projectId: string,
): Promise<OctaviaPoolRedirectPolicy[]> {
  const parentId = requireUuid(
    loadBalancerId,
    "load balancer ID",
  ).toLowerCase();
  const poolId = requireUuid(id, "pool ID").toLowerCase();
  const scope = await resolveScope(regionId, projectId);
  await readPool(scope, parentId, poolId);
  const policies = await readPoolRedirectPolicies(scope, poolId);
  const listenerIds = new Set(
    policies
      .map(({ listener_id }) => listener_id)
      .filter((id) => typeof id === "string" && UUID_PATTERN.test(id)),
  );
  const listeners = await readRedirectPolicyOwners(
    scope,
    parentId,
    listenerIds,
  );
  return policies.map(
    ({
      id,
      name,
      position,
      listener_id,
      redirect_pool_id,
      admin_state_up,
      provisioning_status,
    }) => ({
      id,
      name,
      position,
      listener_id,
      redirect_pool_id,
      admin_state_up,
      provisioning_status,
      listener: listeners.get(listener_id) ?? null,
    }),
  );
}

async function readRedirectPolicyOwners(
  scope: OctaviaScope,
  parentId: string,
  ownerIds: ReadonlySet<string>,
) {
  const owners = new Map<string, Pick<OctaviaListener, "id" | "name">>();
  if (!ownerIds.size) return owners;

  const filters = { project_id: scope.projectId, loadbalancer_id: parentId };
  try {
    const listeners = await listCollection<OctaviaListener>(
      scope,
      "listeners",
      collectionPath("listeners", scope.projectId, filters),
      undefined,
      new URLSearchParams(filters),
    );
    // A cloud can ignore collection filters; only verified owners get links.
    for (const listener of listeners) {
      if (
        ownerIds.has(listener?.id) &&
        belongsToProject(listener.project_id, scope.projectId) &&
        listenerBelongsToLoadBalancer(listener, parentId)
      ) {
        owners.set(listener.id, { id: listener.id, name: listener.name });
      }
    }
  } catch (error) {
    if (
      !(error instanceof OpenStackRequestError) &&
      !(error instanceof OpenStackConnectionError)
    ) {
      throw error;
    }
  }
  return owners;
}

async function readPoolRedirectPolicies(scope: OctaviaScope, poolId: string) {
  const filters = { project_id: scope.projectId, redirect_pool_id: poolId };
  const policies = await listCollection<OctaviaL7Policy>(
    scope,
    "l7policies",
    collectionPath("l7policies", scope.projectId, filters),
    undefined,
    new URLSearchParams(filters),
  );
  // Filtering can be disabled in Octavia, even though it accepts the parameter.
  return policies.filter(
    (policy) =>
      belongsToProject(policy.project_id, scope.projectId) &&
      policy.redirect_pool_id === poolId,
  );
}

async function readListenerL7Policy(
  scope: OctaviaScope,
  listenerId: string,
  policyId: string,
) {
  const policy = await getProjectResource<OctaviaL7Policy>(
    scope,
    "l7policies",
    "l7policy",
    policyId,
  );
  if (policy.id !== policyId || policy.listener_id !== listenerId) {
    throw new OpenStackRequestError(
      404,
      "L7 policy not found on this listener",
    );
  }
  return policy;
}

async function readL7PolicyRules(scope: OctaviaScope, policyId: string) {
  const rules = await listCollection<OctaviaL7Rule>(
    scope,
    "rules",
    nestedCollectionPath(
      `/v2/lbaas/l7policies/${encodeURIComponent(policyId)}/rules`,
    ),
  );
  return rules
    .filter(
      (rule) =>
        belongsToProject(rule.project_id, scope.projectId) &&
        (rule.l7policy_id === undefined || rule.l7policy_id === policyId),
    )
    .map((rule) => ({ ...rule, l7policy_id: policyId }));
}

export async function getLoadBalancerListenerRouting(
  loadBalancerId: string,
  id: string,
  regionId: string,
  projectId: string,
) {
  const parentId = requireUuid(
    loadBalancerId,
    "load balancer ID",
  ).toLowerCase();
  const listenerId = requireUuid(id, "listener ID").toLowerCase();
  const scope = await resolveScope(regionId, projectId);
  const listener = await readListener(scope, parentId, listenerId);
  if (!Array.isArray(listener.l7policies)) {
    throw new Error(
      "Octavia did not return the listener's routing policy references",
    );
  }
  const l7Policies = await Promise.all(
    referenceIds(listener.l7policies, "L7 policy").map((policyId) =>
      readListenerL7Policy(scope, listenerId, policyId),
    ),
  );
  const ruleLists = await Promise.all(
    l7Policies.map(({ id: policyId }) => readL7PolicyRules(scope, policyId)),
  );
  return { l7Policies, l7Rules: ruleLists.flat() };
}

export async function getOctaviaListenerL7Policy(
  listenerId: string,
  policyId: string,
  regionId?: string,
  projectId?: string,
) {
  const parentId = requireUuid(listenerId, "listener ID");
  const id = requireUuid(policyId, "L7 policy ID");
  const scope = await resolveScope(regionId, projectId);
  return readListenerL7Policy(scope, parentId, id);
}

export async function getOctaviaL7Rule(
  policyId: string,
  ruleId: string,
  regionId?: string,
  projectId?: string,
): Promise<OctaviaL7Rule> {
  const parentId = requireUuid(policyId, "L7 policy ID");
  const id = requireUuid(ruleId, "L7 rule ID");
  const scope = await resolveScope(regionId, projectId);
  const payload = await octaviaGet<{ rule: OctaviaL7Rule }>(
    scope,
    `/v2/lbaas/l7policies/${parentId}/rules/${id}`,
  );
  const rule = payload?.rule;
  if (
    rule?.id !== id ||
    !belongsToProject(rule.project_id, scope.projectId) ||
    (rule.l7policy_id !== undefined && rule.l7policy_id !== parentId)
  ) {
    throw new OpenStackRequestError(404, "L7 rule not found on this policy");
  }
  return { ...rule, l7policy_id: parentId };
}

class MissingTopologyResourceError extends Error {
  constructor(cause: unknown) {
    super("Octavia returned a missing pool or child resource in the topology", {
      cause,
    });
  }
}

async function readTopologyResource<T>(request: Promise<T>) {
  try {
    return await request;
  } catch (error) {
    if (isOpenStackNotFoundError(error))
      throw new MissingTopologyResourceError(error);
    throw error;
  }
}

export async function getLoadBalancerDetails(
  id: string,
  regionId?: string,
  projectId?: string,
): Promise<OctaviaLoadBalancerDetails> {
  const loadBalancerId = requireUuid(id, "load balancer ID");
  const scope = await resolveScope(regionId, projectId);
  const capabilities = await discoverLoadBalancerCapabilities(scope.regionId);
  try {
    return await readLoadBalancerDetails(scope, loadBalancerId, capabilities);
  } catch (error) {
    if (!(error instanceof MissingTopologyResourceError)) throw error;
    // An earlier parent read can still reference a just-deleted child.
    return readLoadBalancerDetails(scope, loadBalancerId, capabilities);
  }
}

async function readLoadBalancerDetails(
  scope: OctaviaScope,
  loadBalancerId: string,
  capabilities: OpenStackServiceCapabilities,
): Promise<OctaviaLoadBalancerDetails> {
  const listenerVersion = listenerReadApiVersion(capabilities);
  const readParent = () =>
    readLoadBalancer(scope, loadBalancerId, capabilities);
  const readListeners = (parent: OctaviaLoadBalancer) =>
    Promise.all(
      referenceIds(parent.listeners, "listener").map(async (listenerId) => {
        try {
          return await getProjectResource<OctaviaListener>(
            scope,
            "listeners",
            "listener",
            listenerId,
            listenerVersion,
          );
        } catch (error) {
          if (isOpenStackNotFoundError(error)) return null;
          throw error;
        }
      }),
    );

  let loadBalancer = await readParent();
  const [firstListenerResults, stats, status] = await Promise.all([
    readListeners(loadBalancer),
    readTrafficStats(scope, "loadbalancers", loadBalancerId),
    octaviaGet<{ statuses: { loadbalancer: OctaviaStatusNode } }>(
      scope,
      `/v2/lbaas/loadbalancers/${encodeURIComponent(loadBalancerId)}/status`,
      "return-null",
    ),
  ]);
  let listenerResults = firstListenerResults;
  // A listener can disappear between the parent and child reads during deletion.
  if (listenerResults.includes(null)) {
    loadBalancer = await readParent();
    listenerResults = await readListeners(loadBalancer);
  }
  const listeners = listenerResults.filter((listener) => listener !== null);
  if (listeners.length !== listenerResults.length) {
    throw new Error(
      "Octavia returned a missing listener in the load balancer topology",
    );
  }

  const poolIds = relatedResourceIds(
    [
      ...referenceIds(loadBalancer.pools, "pool"),
      ...listeners.map(({ default_pool_id: poolId }) => poolId),
    ],
    "pool",
  );
  const [initialPools, l7Policies] = await Promise.all([
    Promise.all(
      poolIds.map((poolId) =>
        readTopologyResource(
          getProjectResource<OctaviaPool>(scope, "pools", "pool", poolId),
        ),
      ),
    ),
    Promise.all(
      listeners.flatMap((listener) =>
        referenceIds(listener.l7policies, "L7 policy").map((policyId) =>
          readTopologyResource(
            readListenerL7Policy(scope, listener.id, policyId),
          ),
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
      readTopologyResource(
        getProjectResource<OctaviaPool>(scope, "pools", "pool", poolId),
      ),
    ),
  );
  const pools = [...initialPools, ...redirectPools];
  const healthMonitorsPromise = Promise.all(
    pools.flatMap(({ id: poolId, healthmonitor_id: monitorId }) =>
      monitorId == null
        ? []
        : [
            readTopologyResource(
              readPoolHealthMonitor(scope, poolId, monitorId),
            ),
          ],
    ),
  );

  const [healthMonitors, memberLists, ruleLists] = await Promise.all([
    healthMonitorsPromise,
    Promise.all(
      pools.map(async (pool) => {
        return readTopologyResource(readPoolMembers(scope, pool.id));
      }),
    ),
    Promise.all(
      l7Policies.map(({ id: policyId }) =>
        readTopologyResource(readL7PolicyRules(scope, policyId)),
      ),
    ),
  ]);

  return {
    loadBalancer,
    stats,
    statusTree: status?.statuses?.loadbalancer ?? null,
    listeners,
    pools,
    members: memberLists.flat(),
    healthMonitors,
    l7Policies,
    l7Rules: ruleLists.flat(),
  };
}
