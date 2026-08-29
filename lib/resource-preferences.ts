export const RESOURCE_PREFERENCE_LIMIT = 4;

export const resourceKinds = [
  "instance",
  "volume",
  "image",
  "cluster",
  "bucket",
] as const;

export type ResourceKind = (typeof resourceKinds)[number];

export type ResourcePreferenceInput = {
  kind: ResourceKind;
  id: string;
  name: string;
};

export type ResourcePreference = ResourcePreferenceInput & {
  projectId: string;
  regionId: string;
  updatedAt: number;
};

export type ResourcePreferenceContext = {
  projectId: string;
  regionId: string;
};

export type SerializedResourcePreference = [
  kind: ResourceKind,
  id: string,
  name: string,
  projectId: string,
  regionId: string,
  updatedAt: number,
];

const MAX_ID_LENGTH = 96;
const MAX_NAME_LENGTH = 80;
const MAX_CONTEXT_LENGTH = 64;

const resourceKindSet = new Set<string>(resourceKinds);

function boundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;

  let bounded = "";
  let encodedLength = 0;
  for (const character of normalized) {
    let encodedCharacter: string;
    try {
      encodedCharacter = encodeURIComponent(character);
    } catch {
      continue;
    }
    if (encodedLength + encodedCharacter.length > maxLength) break;
    bounded += character;
    encodedLength += encodedCharacter.length;
  }
  return bounded || null;
}

export function isResourceKind(value: unknown): value is ResourceKind {
  return typeof value === "string" && resourceKindSet.has(value);
}

export function normalizeResourceProjectId(projectId: string) {
  return projectId.replace(/-/g, "").toLowerCase();
}

export function createResourcePreference(
  input: unknown,
  context: ResourcePreferenceContext,
  updatedAt = Date.now(),
): ResourcePreference | null {
  if (!input || typeof input !== "object") return null;

  const candidate = input as Partial<ResourcePreferenceInput>;
  const id = boundedString(candidate.id, MAX_ID_LENGTH);
  const name = boundedString(candidate.name, MAX_NAME_LENGTH);
  const projectId = boundedString(
    normalizeResourceProjectId(context.projectId),
    MAX_CONTEXT_LENGTH,
  );
  const regionId = boundedString(context.regionId, MAX_CONTEXT_LENGTH);

  if (
    !isResourceKind(candidate.kind) ||
    !id ||
    !name ||
    !projectId ||
    !regionId ||
    !Number.isFinite(updatedAt) ||
    updatedAt <= 0
  ) {
    return null;
  }

  return {
    kind: candidate.kind,
    id,
    name,
    projectId,
    regionId,
    updatedAt: Math.floor(updatedAt),
  };
}

export function parseResourcePreferences(value: unknown): ResourcePreference[] {
  if (!Array.isArray(value)) return [];

  const candidates: ResourcePreference[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = Array.isArray(item)
      ? {
          kind: item[0],
          id: item[1],
          name: item[2],
          projectId: item[3],
          regionId: item[4],
          updatedAt: item[5],
        }
      : (item as Partial<ResourcePreference>);
    const resource = createResourcePreference(
      candidate,
      {
        projectId: typeof candidate.projectId === "string" ? candidate.projectId : "",
        regionId: typeof candidate.regionId === "string" ? candidate.regionId : "",
      },
      typeof candidate.updatedAt === "number" ? candidate.updatedAt : Number.NaN,
    );

    if (!resource) continue;
    candidates.push(resource);
  }

  const parsed: ResourcePreference[] = [];
  for (const resource of candidates.sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )) {
    const key = resourcePreferenceKey(resource);
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push(resource);
  }

  return parsed.slice(0, RESOURCE_PREFERENCE_LIMIT);
}

export function serializeResourcePreferences(
  value: ResourcePreference[] | undefined,
): SerializedResourcePreference[] {
  return parseResourcePreferences(value).map((resource) => [
    resource.kind,
    resource.id,
    resource.name,
    resource.projectId,
    resource.regionId,
    resource.updatedAt,
  ]);
}

export function resourcePreferenceKey(
  resource: Pick<ResourcePreference, "kind" | "id" | "projectId" | "regionId">,
) {
  return [
    normalizeResourceProjectId(resource.projectId),
    resource.regionId,
    resource.kind,
    resource.id,
  ].join("\u0000");
}

export function addRecentResource(
  current: ResourcePreference[],
  resource: ResourcePreference,
) {
  const key = resourcePreferenceKey(resource);
  return [
    resource,
    ...parseResourcePreferences(current).filter(
      (candidate) => resourcePreferenceKey(candidate) !== key,
    ),
  ].slice(0, RESOURCE_PREFERENCE_LIMIT);
}

export function togglePinnedResource(
  current: ResourcePreference[],
  resource: ResourcePreference,
) {
  const parsed = parseResourcePreferences(current);
  const key = resourcePreferenceKey(resource);
  const isPinned = parsed.some(
    (candidate) => resourcePreferenceKey(candidate) === key,
  );

  return {
    pinned: !isPinned,
    resources: isPinned
      ? parsed.filter((candidate) => resourcePreferenceKey(candidate) !== key)
      : [resource, ...parsed].slice(0, RESOURCE_PREFERENCE_LIMIT),
  };
}

export function resourcesForContext(
  current: ResourcePreference[],
  context: ResourcePreferenceContext,
) {
  const projectId = normalizeResourceProjectId(context.projectId);
  return parseResourcePreferences(current).filter(
    (resource) =>
      resource.projectId === projectId && resource.regionId === context.regionId,
  );
}

export function visibleResourcePreferences({
  recent,
  pinned,
  context,
}: {
  recent: ResourcePreference[];
  pinned: ResourcePreference[];
  context: ResourcePreferenceContext;
}) {
  const visiblePinned = resourcesForContext(pinned, context);
  const pinnedKeys = new Set(visiblePinned.map(resourcePreferenceKey));
  const visibleRecent = resourcesForContext(recent, context).filter(
    (resource) => !pinnedKeys.has(resourcePreferenceKey(resource)),
  );

  return { pinned: visiblePinned, recent: visibleRecent };
}

export function resourcePreferenceHref(
  resource: Pick<ResourcePreferenceInput, "kind" | "id">,
) {
  const id = encodeURIComponent(resource.id);
  switch (resource.kind) {
    case "instance":
      return `/compute/instances/${id}/overview`;
    case "volume":
      return `/compute/volumes/${id}`;
    case "image":
      return `/compute/images/${id}`;
    case "cluster":
      return `/kubernetes/clusters/${id}/overview`;
    case "bucket":
      return `/object-storage/buckets/${id}`;
  }
}

export function resourceKindLabel(kind: ResourceKind) {
  return {
    instance: "Instance",
    volume: "Volume",
    image: "Image",
    cluster: "Kubernetes cluster",
    bucket: "Bucket",
  }[kind];
}
