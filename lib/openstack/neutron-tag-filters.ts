import {
  NEUTRON_MAX_TAG_LENGTH,
  formatNeutronTag,
  neutronTagLength,
} from "@/lib/openstack/neutron-tags";

export const NEUTRON_TAG_FILTER_PARAM = "tag";
export const NEUTRON_TAG_FILTER_MODE_PARAM = "tag-mode";
export const NEUTRON_TAG_FILTER_MAX_TAGS = 50;

export type NeutronTagFilterMode = "all" | "any";

export type NeutronTagFilter = {
  mode: NeutronTagFilterMode;
  tags: string[];
};

export type NeutronTagFilterSearchParams = {
  [NEUTRON_TAG_FILTER_PARAM]?: string | string[];
  [NEUTRON_TAG_FILTER_MODE_PARAM]?: string | string[];
};

export type NeutronTagFilterParseResult = {
  filter?: NeutronTagFilter;
  error?: string;
};

function values(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function neutronTagFilterError(filter: NeutronTagFilter) {
  if (filter.mode !== "all" && filter.mode !== "any") {
    return "Select whether all tags or any tag must match.";
  }
  if (filter.tags.length === 0) return "Add at least one tag.";
  if (filter.tags.length > NEUTRON_TAG_FILTER_MAX_TAGS) {
    return `Use no more than ${NEUTRON_TAG_FILTER_MAX_TAGS} tag filters.`;
  }

  const seen = new Set<string>();
  for (const tag of filter.tags) {
    if (tag.length === 0) {
      return "Empty tags cannot be used in a Networking list filter.";
    }
    if (neutronTagLength(tag) > NEUTRON_MAX_TAG_LENGTH) {
      return `Each tag filter must be ${NEUTRON_MAX_TAG_LENGTH} characters or fewer.`;
    }
    if (tag.includes(",")) {
      return `${formatNeutronTag(tag)} cannot be filtered because the Networking API reserves commas between tags.`;
    }
    if (seen.has(tag)) {
      return `Remove the duplicate tag ${formatNeutronTag(tag)}.`;
    }
    seen.add(tag);
  }

  const query = new URLSearchParams({ tags: filter.tags.join(",") });
  if (query.toString().length > 4_096) {
    return "The combined tag filter is too long. Remove some tags.";
  }
  return null;
}

export function parseNeutronTagFilterSearchParams(
  searchParams: NeutronTagFilterSearchParams,
): NeutronTagFilterParseResult {
  const tags = values(searchParams[NEUTRON_TAG_FILTER_PARAM]);
  const modes = values(searchParams[NEUTRON_TAG_FILTER_MODE_PARAM]);
  if (tags.length === 0 && modes.length === 0) return {};
  if (modes.length > 1) {
    return { error: "Select one tag matching mode." };
  }

  const mode = modes[0] ?? "all";
  if (mode !== "all" && mode !== "any") {
    return { error: "Select whether all tags or any tag must match." };
  }

  const filter = { mode, tags } satisfies NeutronTagFilter;
  const error = neutronTagFilterError(filter);
  return error ? { error } : { filter };
}

export function parseNeutronTagFilterInput(
  value: unknown,
): NeutronTagFilterParseResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Add a valid tag filter." };
  }
  const mode = Reflect.get(value, "mode");
  const tags = Reflect.get(value, "tags");
  if (
    (mode !== "all" && mode !== "any") ||
    !Array.isArray(tags) ||
    !tags.every((tag) => typeof tag === "string")
  ) {
    return { error: "Add a valid tag filter." };
  }
  const filter = { mode, tags } satisfies NeutronTagFilter;
  const error = neutronTagFilterError(filter);
  return error ? { error } : { filter };
}

export function neutronTagFilterApiQuery(filter: NeutronTagFilter) {
  const error = neutronTagFilterError(filter);
  if (error) throw new Error(error);
  return {
    [filter.mode === "all" ? "tags" : "tags-any"]: filter.tags.join(","),
  };
}

export function neutronTagFilterQueryKey(filter?: NeutronTagFilter) {
  return filter ? [filter.mode, ...filter.tags] : [];
}
