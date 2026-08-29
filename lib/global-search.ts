import {
  resourceKindLabel,
  resourcePreferenceHref,
  type ResourceKind,
  type ResourcePreferenceInput,
} from "@/lib/resource-preferences";

export const GLOBAL_SEARCH_RESOURCE_LIMIT = 100;

export type GlobalSearchResource = ResourcePreferenceInput & {
  href: string;
  status?: string;
};

export type GlobalSearchIndex = {
  resources: GlobalSearchResource[];
  unavailableSources: string[];
};

type ResourceSource = {
  kind: ResourceKind;
  items: unknown;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resourceFromRecord(
  kind: ResourceKind,
  value: unknown,
): GlobalSearchResource | null {
  const record = recordValue(value);
  if (!record) return null;

  const id =
    stringValue(record.id) ??
    (kind === "bucket" ? stringValue(record.name) : null);
  if (!id) return null;

  const name = stringValue(record.name) ?? id;
  const status = stringValue(record.status) ?? undefined;

  return {
    kind,
    id,
    name,
    href: resourcePreferenceHref({ kind, id }),
    status,
  };
}

export function buildGlobalSearchResources(
  sources: ResourceSource[],
  limit = GLOBAL_SEARCH_RESOURCE_LIMIT,
) {
  const boundedLimit = Math.max(0, Math.floor(limit));
  const resources: GlobalSearchResource[] = [];

  for (const source of sources) {
    if (!Array.isArray(source.items)) continue;

    for (const item of source.items.slice(0, boundedLimit)) {
      const resource = resourceFromRecord(source.kind, item);
      if (resource) resources.push(resource);
    }
  }

  return resources.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export function globalSearchResourceKey(
  resource: Pick<GlobalSearchResource, "kind" | "id">,
) {
  return `${resource.kind}\u0000${resource.id}`;
}

export function resourcePreferenceToSearchResource(
  resource: ResourcePreferenceInput,
): GlobalSearchResource {
  return {
    ...resource,
    href: resourcePreferenceHref(resource),
  };
}

export function excludeKnownGlobalSearchResources(
  resources: GlobalSearchResource[],
  known: Array<Pick<GlobalSearchResource, "kind" | "id">>,
) {
  const knownKeys = new Set(known.map(globalSearchResourceKey));
  return resources.filter(
    (resource) => !knownKeys.has(globalSearchResourceKey(resource)),
  );
}

export function globalSearchResourceDescription(
  resource: Pick<GlobalSearchResource, "kind" | "id" | "status">,
) {
  const parts = [resourceKindLabel(resource.kind)];
  if (resource.status) parts.push(resource.status);
  parts.push(resource.id);
  return parts.join(" · ");
}
