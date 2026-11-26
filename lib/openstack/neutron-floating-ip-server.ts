import "server-only";

import { isIP } from "node:net";
import { OpenStackRequestError } from "@/lib/openstack/request";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getSession } from "@/lib/session";

const SERVICE_TYPE = "network";
const SERVICE_NAME = "neutron";
const COLLECTION_PAGE_SIZE = 100;
const MAX_COLLECTION_PAGES = 100;
const FILTER_CONCURRENCY = 8;
const FLOATING_IPS_API_PATH = "/v2.0/floatingips";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NeutronScope = {
  projectId: string;
  regionId: string;
};

type FloatingIpFilter =
  | { floating_ip_address: string }
  | { port_id: string }
  | { unassociated: true };

export type NeutronFloatingIpReference = {
  floating_ip_address: string;
  id: string;
  port_id: string | null;
  fixed_ip_address?: string | null;
};

function normalizeProjectId(value: string) {
  return value.replaceAll("-", "").toLowerCase();
}

async function resolveScope(
  regionId?: string,
  projectId?: string,
): Promise<NeutronScope> {
  const session = await getSession();
  if (!session.regionId || !session.projectId) {
    throw new Error("No active project scope for Neutron request");
  }
  if (regionId && regionId !== session.regionId) {
    throw new Error("Neutron region does not match the active session");
  }
  if (
    projectId &&
    normalizeProjectId(projectId) !== normalizeProjectId(session.projectId)
  ) {
    throw new Error("Neutron project does not match the active session");
  }
  return { regionId: session.regionId, projectId: session.projectId };
}

function collectionPath(
  scope: NeutronScope,
  filter: FloatingIpFilter,
  marker?: string,
) {
  const query = new URLSearchParams({
    limit: String(COLLECTION_PAGE_SIZE),
    project_id: scope.projectId,
    ...("unassociated" in filter ? {} : filter),
  });
  if (marker) query.set("marker", marker);
  return `${FLOATING_IPS_API_PATH}?${query}`;
}

function nextCollectionPath(
  links: unknown,
  scope: NeutronScope,
  filter: FloatingIpFilter,
) {
  if (links === undefined || links === null) return null;
  if (!Array.isArray(links)) {
    throw new Error("Invalid Neutron floating IP pagination links");
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

  const url = new URL(next.href, "https://neutron.invalid");
  const apiPathIndex = url.pathname.indexOf(FLOATING_IPS_API_PATH);
  if (
    apiPathIndex < 0 ||
    url.pathname.slice(apiPathIndex) !== FLOATING_IPS_API_PATH
  ) {
    throw new Error("Invalid Neutron floating IP pagination target");
  }
  const marker = url.searchParams.get("marker");
  if (!marker || !UUID_PATTERN.test(marker)) {
    throw new Error("Invalid Neutron floating IP pagination marker");
  }

  return collectionPath(scope, filter, marker);
}

function parseFloatingIps(
  payload: unknown,
  scope: NeutronScope,
  filter: FloatingIpFilter,
) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Neutron floating IP response");
  }
  const floatingIps = Reflect.get(payload, "floatingips");
  if (!Array.isArray(floatingIps)) {
    throw new Error("Invalid Neutron floating IP response");
  }

  const references: NeutronFloatingIpReference[] = [];
  for (const floatingIp of floatingIps) {
    if (!floatingIp || typeof floatingIp !== "object") {
      throw new Error("Invalid Neutron floating IP item");
    }
    const id = Reflect.get(floatingIp, "id");
    const address = Reflect.get(floatingIp, "floating_ip_address");
    const portId = Reflect.get(floatingIp, "port_id");
    const fixedIp = Reflect.get(floatingIp, "fixed_ip_address");
    const forwardings = Reflect.get(floatingIp, "port_forwardings");
    const resourceProjectId =
      Reflect.get(floatingIp, "project_id") ??
      Reflect.get(floatingIp, "tenant_id");
    if (
      typeof id !== "string" ||
      !UUID_PATTERN.test(id) ||
      typeof address !== "string" ||
      isIP(address) === 0 ||
      (portId !== null &&
        (typeof portId !== "string" || !UUID_PATTERN.test(portId))) ||
      typeof resourceProjectId !== "string"
    ) {
      throw new Error("Invalid Neutron floating IP item");
    }
    if (
      normalizeProjectId(resourceProjectId) !==
      normalizeProjectId(scope.projectId)
    ) {
      continue;
    }
    if (
      ("floating_ip_address" in filter &&
        address !== filter.floating_ip_address) ||
      ("port_id" in filter && portId !== filter.port_id) ||
      ("unassociated" in filter &&
        (portId !== null ||
          fixedIp !== null ||
          isIP(address) !== 4 ||
          Reflect.get(floatingIp, "router_id") !== null ||
          (forwardings !== undefined &&
            (!Array.isArray(forwardings) || forwardings.length !== 0))))
    ) {
      continue;
    }
    references.push({
      floating_ip_address: address,
      id,
      port_id: portId,
      ...(fixedIp === null || (typeof fixedIp === "string" && isIP(fixedIp))
        ? { fixed_ip_address: fixedIp }
        : {}),
    });
  }
  return references;
}

async function listFilteredFloatingIps(
  scope: NeutronScope,
  filter: FloatingIpFilter,
) {
  const references: NeutronFloatingIpReference[] = [];
  const visited = new Set<string>();
  let path: string | null = collectionPath(scope, filter);

  while (path) {
    if (visited.has(path) || visited.size >= MAX_COLLECTION_PAGES) {
      throw new Error("Invalid Neutron floating IP pagination");
    }
    visited.add(path);

    const payload = await openstackRequest<unknown>({
      regionId: scope.regionId,
      serviceType: SERVICE_TYPE,
      serviceName: SERVICE_NAME,
      path,
      errorMode: "throw",
    });
    references.push(...parseFloatingIps(payload, scope, filter));
    path = nextCollectionPath(
      payload && typeof payload === "object"
        ? Reflect.get(payload, "floatingips_links")
        : undefined,
      scope,
      filter,
    );
  }

  return references;
}

export async function listFloatingIpsForAddresses(
  addresses: readonly string[],
  regionId?: string,
  projectId?: string,
) {
  if (addresses.some((address) => isIP(address) === 0)) {
    throw new Error("Neutron floating IP filters require IP addresses");
  }
  const scope = await resolveScope(regionId, projectId);
  const uniqueAddresses = [...new Set(addresses)];
  const references: NeutronFloatingIpReference[] = [];

  for (
    let index = 0;
    index < uniqueAddresses.length;
    index += FILTER_CONCURRENCY
  ) {
    const batch = uniqueAddresses.slice(index, index + FILTER_CONCURRENCY);
    const results = await Promise.all(
      batch.map((floatingIpAddress) =>
        listFilteredFloatingIps(scope, {
          floating_ip_address: floatingIpAddress,
        }),
      ),
    );
    references.push(...results.flat());
  }

  return references;
}

export async function listFloatingIpsForPort(
  portId: string,
  regionId?: string,
  projectId?: string,
) {
  if (!UUID_PATTERN.test(portId)) {
    throw new OpenStackRequestError(404, "port not found");
  }
  const scope = await resolveScope(regionId, projectId);
  return listFilteredFloatingIps(scope, { port_id: portId });
}

export async function listUnassociatedFloatingIps(
  regionId?: string,
  projectId?: string,
) {
  const scope = await resolveScope(regionId, projectId);
  return listFilteredFloatingIps(scope, { unassociated: true });
}
