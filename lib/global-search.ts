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
  tags?: string[];
};

export type GlobalSearchIndex = {
  resources: GlobalSearchResource[];
  unavailableSources: string[];
};

const resourceSearchTerms: Record<ResourceKind, string[]> = {
  instance: ["server", "virtual machine", "vm", "nova", "ec2"],
  volume: ["disk", "block storage", "cinder", "ebs"],
  image: ["glance", "boot image", "machine image", "ami"],
  cluster: ["kubernetes", "k8s", "magnum", "capi", "eks", "gke"],
  "load-balancer": ["octavia", "lb", "vip", "listener", "pool"],
  network: ["neutron", "networking", "vpc", "subnet"],
  router: ["neutron", "networking", "gateway", "route"],
  port: ["neutron", "networking", "interface", "nic"],
  "floating-ip": ["neutron", "networking", "floating ip", "public ip"],
  "security-group": ["neutron", "networking", "firewall", "rules"],
  bucket: ["s3", "rgw", "object storage", "blob storage"],
  share: ["manila", "nfs", "shared file system"],
  "share-snapshot": ["manila", "share snapshot", "shared file system backup"],
  secret: ["barbican", "key vault", "secret manager", "kms"],
  "secret-container": ["barbican", "certificate", "secret group"],
  "secret-order": ["barbican", "generate key", "certificate request"],
};

type ResourceSource = {
  kind: ResourceKind;
  items: unknown;
  searchTags?: boolean;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      ),
    ),
  ];
}

function resourceFromRecord(
  kind: ResourceKind,
  value: unknown,
  searchTags: boolean,
): GlobalSearchResource | null {
  const record = recordValue(value);
  if (!record) return null;

  const id =
    stringValue(record.id) ??
    (kind === "bucket" ? stringValue(record.name) : null);
  if (!id) return null;

  const name = stringValue(record.name) ?? id;
  const status = stringValue(record.status) ?? undefined;
  const tags = searchTags ? stringList(record.tags) : [];

  return {
    kind,
    id,
    name,
    href: resourcePreferenceHref({ kind, id }),
    status,
    ...(tags.length ? { tags } : {}),
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
      const resource = resourceFromRecord(
        source.kind,
        item,
        source.searchTags === true,
      );
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

export function enrichGlobalSearchResources(
  resources: ResourcePreferenceInput[],
  fetched: GlobalSearchResource[],
) {
  const fetchedByKey = new Map(
    fetched.map((resource) => [globalSearchResourceKey(resource), resource]),
  );
  return resources.map((resource) => {
    const fetchedResource = fetchedByKey.get(globalSearchResourceKey(resource));
    return fetchedResource ?? resourcePreferenceToSearchResource(resource);
  });
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

export function globalSearchResourceValue(resource: GlobalSearchResource) {
  return [
    resource.name,
    resource.kind,
    resource.id,
    resource.status,
    ...(resource.tags ?? []),
    ...(resource.tags ?? []).map((tag) => `tag:${tag}`),
    ...resourceSearchTerms[resource.kind],
  ]
    .filter(Boolean)
    .join(" ");
}
