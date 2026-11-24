"use server";

import {
  novaTagFilterApiQuery,
  parseNovaTagFilterInput,
  serverMatchesNovaTagFilter,
  type NovaTagFilter,
} from "@/lib/openstack/nova-tag-filters";
import { OpenStackRequestError } from "@/lib/openstack/request";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getSession, normalizeProjectId } from "@/lib/session";
import type { Server } from "@/types/openstack";

const NOVA_API_VERSION = "compute 2.79";
const COLLECTION_PATH = "/servers/detail";
const COLLECTION_PAGE_LIMIT = "1000";
const MAX_COLLECTION_PAGES = 100;

function validScopeValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    !/[\r\n]/.test(value)
  );
}

async function resolveScope(regionId: unknown, projectId: unknown) {
  if (!validScopeValue(regionId) || !validScopeValue(projectId)) {
    throw new Error("Invalid Compute project scope");
  }
  const session = await getSession();
  if (!session.regionId || !session.projectId) {
    throw new Error("No active project scope for Compute request");
  }
  if (regionId !== session.regionId) {
    throw new Error("Compute region does not match the active session");
  }
  if (normalizeProjectId(projectId) !== normalizeProjectId(session.projectId)) {
    throw new Error("Compute project does not match the active session");
  }
  return { regionId: session.regionId, projectId: session.projectId };
}

function collectionPath(filter: NovaTagFilter | undefined, marker?: string) {
  const query = new URLSearchParams(
    filter ? novaTagFilterApiQuery(filter) : undefined,
  );
  query.set("limit", COLLECTION_PAGE_LIMIT);
  if (marker) query.set("marker", marker);
  return `${COLLECTION_PATH}?${query}`;
}

function parseOwnedServers(
  payload: unknown,
  projectId: string,
  filter: NovaTagFilter,
) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Compute server list response");
  }
  const servers = Reflect.get(payload, "servers");
  if (!Array.isArray(servers)) {
    throw new Error("Invalid Compute server list response");
  }

  return servers.flatMap((server): Server[] => {
    if (!server || typeof server !== "object") {
      throw new Error("Invalid Compute server response");
    }
    const id = Reflect.get(server, "id");
    const owner = Reflect.get(server, "tenant_id");
    const tags = Reflect.get(server, "tags");
    if (
      typeof id !== "string" ||
      typeof owner !== "string" ||
      !Array.isArray(tags) ||
      !tags.every((tag) => typeof tag === "string")
    ) {
      throw new Error("Invalid Compute server response");
    }
    if (normalizeProjectId(owner) !== normalizeProjectId(projectId)) return [];
    if (!serverMatchesNovaTagFilter(tags, filter)) return [];
    return [server as Server];
  });
}

function nextCollectionPath(payload: unknown, filter?: NovaTagFilter) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Compute server list response");
  }
  const links = Reflect.get(payload, "servers_links");
  if (links === undefined || links === null) return null;
  if (!Array.isArray(links)) {
    throw new Error("Invalid Compute pagination links");
  }

  const nextLinks = links.filter(
    (link) =>
      link && typeof link === "object" && Reflect.get(link, "rel") === "next",
  );
  if (nextLinks.length === 0) return null;
  if (nextLinks.length !== 1) {
    throw new Error("Invalid Compute pagination links");
  }
  const href = Reflect.get(nextLinks[0], "href");
  if (typeof href !== "string" || href.length === 0) {
    throw new Error("Invalid Compute pagination links");
  }

  let url: URL;
  try {
    url = new URL(href, `https://nova.invalid${COLLECTION_PATH}`);
  } catch {
    throw new Error("Invalid Compute pagination target");
  }
  if (!url.pathname.endsWith(COLLECTION_PATH)) {
    throw new Error("Invalid Compute pagination target");
  }
  const marker = url.searchParams.get("marker");
  if (!validScopeValue(marker)) {
    throw new Error("Invalid Compute pagination marker");
  }
  return collectionPath(filter, marker);
}

async function collectProjectServers(
  scope: { regionId: string; projectId: string },
  filter: NovaTagFilter,
  useNovaFilter: boolean,
) {
  const servers: Server[] = [];
  const serverIds = new Set<string>();
  const visited = new Set<string>();
  const apiFilter = useNovaFilter ? filter : undefined;
  let path: string | null = collectionPath(apiFilter);

  while (path) {
    if (visited.has(path) || visited.size >= MAX_COLLECTION_PAGES) {
      throw new Error("Invalid Compute pagination");
    }
    visited.add(path);

    const payload = await openstackRequest<unknown>({
      regionId: scope.regionId,
      serviceType: "compute",
      serviceName: "nova",
      path,
      apiVersion: NOVA_API_VERSION,
      errorMode: "throw",
    });
    const page = parseOwnedServers(payload, scope.projectId, filter);
    for (const server of page) {
      if (serverIds.has(server.id)) {
        throw new Error("Invalid Compute pagination");
      }
      serverIds.add(server.id);
      servers.push(server);
    }
    path = nextCollectionPath(payload, apiFilter);
  }

  return servers;
}

export async function listProjectNovaServersByTags(
  regionId: unknown,
  projectId: unknown,
  input: unknown,
): Promise<Server[]> {
  const parsed = parseNovaTagFilterInput(input);
  if (!parsed.filter)
    throw new Error(parsed.error ?? "Add a valid tag filter.");

  const scope = await resolveScope(regionId, projectId);
  try {
    return await collectProjectServers(scope, parsed.filter, true);
  } catch (error) {
    if (!(error instanceof OpenStackRequestError) || error.status !== 400) {
      throw error;
    }
  }
  return collectProjectServers(scope, parsed.filter, false);
}
