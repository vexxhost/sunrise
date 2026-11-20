"use server";

import { extensionSupport } from "@/lib/openstack/capabilities";
import {
  discoverNetworkCapabilities,
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
} from "@/lib/openstack/capabilities-server";
import {
  neutronTagFilterApiQuery,
  parseNeutronTagFilterInput,
  type NeutronTagFilter,
} from "@/lib/openstack/neutron-tag-filters";
import { openstackRequest } from "@/lib/openstack/request-server";
import { getSession, normalizeProjectId } from "@/lib/session";

const TAGGABLE_COLLECTIONS = {
  network: { collection: "networks", payloadKey: "networks" },
  router: { collection: "routers", payloadKey: "routers" },
  "floating-ip": {
    collection: "floatingips",
    payloadKey: "floatingips",
  },
  "security-group": {
    collection: "security-groups",
    payloadKey: "security_groups",
  },
  port: { collection: "ports", payloadKey: "ports" },
} as const;

const MAX_COLLECTION_PAGES = 100;

export type NeutronTagFilterResource = keyof typeof TAGGABLE_COLLECTIONS;

type TaggableCollection =
  (typeof TAGGABLE_COLLECTIONS)[NeutronTagFilterResource];

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
    throw new Error("Invalid Networking project scope");
  }
  const session = await getSession();
  if (!session.regionId || !session.projectId) {
    throw new Error("No active project scope for Networking request");
  }
  if (regionId !== session.regionId) {
    throw new Error("Networking region does not match the active session");
  }
  if (normalizeProjectId(projectId) !== normalizeProjectId(session.projectId)) {
    throw new Error("Networking project does not match the active session");
  }
  return { regionId: session.regionId, projectId: session.projectId };
}

function parseOwnedItems(
  payload: unknown,
  payloadKey: string,
  projectId: string,
  filter: NeutronTagFilter,
) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Networking list response");
  }
  const values = Reflect.get(payload, payloadKey);
  if (!Array.isArray(values)) {
    throw new Error("Invalid Networking list response");
  }

  return values.filter((value) => {
    if (!value || typeof value !== "object") {
      throw new Error("Invalid Networking resource response");
    }
    const id = Reflect.get(value, "id");
    const owner =
      Reflect.get(value, "project_id") ?? Reflect.get(value, "tenant_id");
    if (typeof id !== "string" || typeof owner !== "string") {
      throw new Error("Invalid Networking resource response");
    }
    if (normalizeProjectId(owner) !== normalizeProjectId(projectId)) {
      return false;
    }

    const tags = Reflect.get(value, "tags");
    if (tags === undefined) return false;
    if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
      throw new Error("Invalid Networking resource response");
    }
    const resourceTags = new Set(tags);
    return filter.mode === "all"
      ? filter.tags.every((tag) => resourceTags.has(tag))
      : filter.tags.some((tag) => resourceTags.has(tag));
  });
}

function collectionPath(
  definition: TaggableCollection,
  projectId: string,
  filter: NeutronTagFilter,
  marker?: string,
) {
  const query = new URLSearchParams({
    project_id: projectId,
    ...neutronTagFilterApiQuery(filter),
  });
  if (marker) query.set("marker", marker);
  return `/v2.0/${definition.collection}?${query}`;
}

function nextCollectionPath(
  payload: unknown,
  definition: TaggableCollection,
  projectId: string,
  filter: NeutronTagFilter,
) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Networking list response");
  }
  const links = Reflect.get(payload, `${definition.payloadKey}_links`);
  if (links === undefined || links === null) return null;
  if (!Array.isArray(links)) {
    throw new Error("Invalid Networking pagination links");
  }

  const nextLinks = links.filter(
    (link) =>
      link &&
      typeof link === "object" &&
      Reflect.get(link, "rel") === "next",
  );
  if (nextLinks.length === 0) return null;
  if (nextLinks.length !== 1) {
    throw new Error("Invalid Networking pagination links");
  }
  const href = Reflect.get(nextLinks[0], "href");
  if (typeof href !== "string" || href.length === 0) {
    throw new Error("Invalid Networking pagination links");
  }

  const expectedPath = `/v2.0/${definition.collection}`;
  let url: URL;
  try {
    url = new URL(href, `https://neutron.invalid${expectedPath}`);
  } catch {
    throw new Error("Invalid Networking pagination target");
  }
  if (!url.pathname.endsWith(expectedPath)) {
    throw new Error("Invalid Networking pagination target");
  }

  const marker = url.searchParams.get("marker");
  if (!validScopeValue(marker)) {
    throw new Error("Invalid Networking pagination marker");
  }
  return collectionPath(definition, projectId, filter, marker);
}

export async function listProjectNeutronResourcesByTags(
  regionId: unknown,
  projectId: unknown,
  resourceType: unknown,
  input: unknown,
): Promise<unknown[]> {
  if (
    typeof resourceType !== "string" ||
    !Object.hasOwn(TAGGABLE_COLLECTIONS, resourceType)
  ) {
    throw new Error("Select a supported Networking resource");
  }
  const parsed = parseNeutronTagFilterInput(input);
  if (!parsed.filter)
    throw new Error(parsed.error ?? "Add a valid tag filter.");

  const scope = await resolveScope(regionId, projectId);
  const capabilities = await discoverNetworkCapabilities(scope.regionId);
  const support = extensionSupport(
    capabilities,
    NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION,
    "Networking tag filters",
  );
  if (support.status === "unsupported") throw new Error(support.message);

  const definition =
    TAGGABLE_COLLECTIONS[resourceType as NeutronTagFilterResource];
  const items: unknown[] = [];
  const visited = new Set<string>();
  let path: string | null = collectionPath(
    definition,
    scope.projectId,
    parsed.filter,
  );

  while (path) {
    if (visited.has(path) || visited.size >= MAX_COLLECTION_PAGES) {
      throw new Error("Invalid Networking pagination");
    }
    visited.add(path);

    const payload = await openstackRequest<unknown>({
      regionId: scope.regionId,
      serviceType: "network",
      serviceName: "neutron",
      path,
      errorMode: "throw",
    });
    items.push(
      ...parseOwnedItems(
        payload,
        definition.payloadKey,
        scope.projectId,
        parsed.filter,
      ),
    );
    path = nextCollectionPath(
      payload,
      definition,
      scope.projectId,
      parsed.filter,
    );
  }

  return items;
}
