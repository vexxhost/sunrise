import "server-only";

import { openstackRequest } from "@/lib/openstack/request-server";
import { OpenStackRequestError } from "@/lib/openstack/request";
import { getSession } from "@/lib/session";
import type {
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
  if (!url.pathname.startsWith("/v2/lbaas/")) {
    throw new Error(`Invalid Octavia ${collection} pagination target`);
  }
  return `${url.pathname}${url.search}`;
}

async function octaviaGet<T>(
  scope: OctaviaScope,
  path: string,
  errorMode: "return-null" | "throw" = "throw",
) {
  return openstackRequest<T>({
    regionId: scope.regionId,
    serviceType: SERVICE_TYPE,
    serviceName: SERVICE_NAME,
    path,
    errorMode,
  });
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

function referencesResource(
  references: Array<{ id: string }> | undefined,
  id: string,
) {
  return references?.some((reference) => reference.id === id) ?? false;
}

function belongsToProject(resourceProjectId: string, projectId: string) {
  return (
    normalizeProjectId(resourceProjectId) === normalizeProjectId(projectId)
  );
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

  const [listeners, pools, healthMonitors, l7Policies, stats, status] =
    await Promise.all([
      listCollection<OctaviaListener>(
        scope,
        "listeners",
        collectionPath("listeners", scope.projectId),
      ),
      listCollection<OctaviaPool>(
        scope,
        "pools",
        collectionPath("pools", scope.projectId),
      ),
      listCollection<OctaviaHealthMonitor>(
        scope,
        "healthmonitors",
        collectionPath("healthmonitors", scope.projectId),
      ),
      listCollection<OctaviaL7Policy>(
        scope,
        "l7policies",
        collectionPath("l7policies", scope.projectId),
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

  const loadBalancerListenerIds = new Set(
    loadBalancer.listeners?.map(({ id: listenerId }) => listenerId) ?? [],
  );
  const relatedListeners = listeners.filter(
    (listener) =>
      loadBalancerListenerIds.has(listener.id) ||
      referencesResource(listener.loadbalancers, loadBalancerId),
  );
  const listenerIds = new Set(
    relatedListeners.map(({ id: listenerId }) => listenerId),
  );
  const loadBalancerPoolIds = new Set(
    loadBalancer.pools?.map(({ id: poolId }) => poolId) ?? [],
  );
  const defaultPoolIds = new Set(
    relatedListeners
      .map(({ default_pool_id: poolId }) => poolId)
      .filter((poolId): poolId is string => Boolean(poolId)),
  );
  const relatedPools = pools.filter(
    (pool) =>
      loadBalancerPoolIds.has(pool.id) ||
      defaultPoolIds.has(pool.id) ||
      referencesResource(pool.loadbalancers, loadBalancerId) ||
      pool.listeners?.some(({ id: listenerId }) => listenerIds.has(listenerId)),
  );
  const poolIds = new Set(relatedPools.map(({ id: poolId }) => poolId));
  const healthMonitorIds = new Set(
    relatedPools
      .map(({ healthmonitor_id: healthMonitorId }) => healthMonitorId)
      .filter((healthMonitorId): healthMonitorId is string =>
        Boolean(healthMonitorId),
      ),
  );
  const relatedHealthMonitors = healthMonitors.filter(
    (monitor) =>
      healthMonitorIds.has(monitor.id) ||
      monitor.pools?.some(({ id: poolId }) => poolIds.has(poolId)),
  );
  const listenerPolicyIds = new Set(
    relatedListeners.flatMap(({ l7policies: policies = [] }) =>
      policies.map(({ id: policyId }) => policyId),
    ),
  );
  const relatedL7Policies = l7Policies.filter(
    (policy) =>
      listenerIds.has(policy.listener_id) || listenerPolicyIds.has(policy.id),
  );

  const [memberLists, ruleLists] = await Promise.all([
    Promise.all(
      relatedPools.map(async (pool) => {
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
      relatedL7Policies.map(async (policy) => {
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
    listeners: relatedListeners,
    pools: relatedPools,
    members: memberLists.flat(),
    healthMonitors: relatedHealthMonitors,
    l7Policies: relatedL7Policies,
    l7Rules: ruleLists.flat(),
  };
}
