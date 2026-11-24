import { validateNovaTagValues } from "@/lib/openstack/nova-tags";

export const NOVA_TAG_FILTER_PARAM = "tag";
export const NOVA_TAG_FILTER_MODE_PARAM = "tag-mode";

export type NovaTagFilterMode = "all" | "any";

export type NovaTagFilter = {
  mode: NovaTagFilterMode;
  tags: readonly string[];
};

export type NovaTagFilterSearchParams = {
  [NOVA_TAG_FILTER_PARAM]?: string | string[];
  [NOVA_TAG_FILTER_MODE_PARAM]?: string | string[];
};

export type NovaTagFilterParseResult = {
  filter?: NovaTagFilter;
  error?: string;
};

function values(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function novaTagFilterError(filter: NovaTagFilter) {
  if (filter.mode !== "all" && filter.mode !== "any") {
    return "Select whether all tags or any tag must match.";
  }
  if (filter.tags.length === 0) return "Add at least one tag.";

  const parsed = validateNovaTagValues([...filter.tags]);
  if (!parsed.ok) return parsed.error;

  const apiQuery = novaTagFilterApiQueryUnchecked(filter);
  const query = new URLSearchParams(apiQuery);
  if (query.toString().length > 4_096) {
    return "The combined tag filter is too long. Remove some tags.";
  }
  return null;
}

export function parseNovaTagFilterSearchParams(
  searchParams: NovaTagFilterSearchParams,
): NovaTagFilterParseResult {
  const tags = values(searchParams[NOVA_TAG_FILTER_PARAM]);
  const modes = values(searchParams[NOVA_TAG_FILTER_MODE_PARAM]);
  if (tags.length === 0 && modes.length === 0) return {};
  if (modes.length > 1) return { error: "Select one tag matching mode." };

  const mode = modes[0] ?? "all";
  if (mode !== "all" && mode !== "any") {
    return { error: "Select whether all tags or any tag must match." };
  }

  const filter = { mode, tags } satisfies NovaTagFilter;
  const error = novaTagFilterError(filter);
  return error ? { error } : { filter };
}

export function parseNovaTagFilterInput(
  value: unknown,
): NovaTagFilterParseResult {
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

  const filter = { mode, tags } satisfies NovaTagFilter;
  const error = novaTagFilterError(filter);
  return error ? { error } : { filter };
}

function novaTagFilterApiQueryUnchecked(filter: NovaTagFilter) {
  return {
    [filter.mode === "all" ? "tags" : "tags-any"]: filter.tags.join(","),
  };
}

export function novaTagFilterApiQuery(filter: NovaTagFilter) {
  const error = novaTagFilterError(filter);
  if (error) throw new Error(error);
  return novaTagFilterApiQueryUnchecked(filter);
}

export function novaTagFilterQueryKey(filter?: NovaTagFilter) {
  return filter ? [filter.mode, ...filter.tags] : [];
}

export function withNovaTagFilter(
  searchParams: URLSearchParams | string,
  filter?: NovaTagFilter,
) {
  const next = new URLSearchParams(searchParams);
  next.delete(NOVA_TAG_FILTER_PARAM);
  next.delete(NOVA_TAG_FILTER_MODE_PARAM);
  if (!filter) return next;

  const error = novaTagFilterError(filter);
  if (error) throw new Error(error);
  for (const tag of filter.tags) {
    next.append(NOVA_TAG_FILTER_PARAM, tag);
  }
  if (filter.mode === "any") {
    next.set(NOVA_TAG_FILTER_MODE_PARAM, "any");
  }
  return next;
}

export function novaTagFilterHref(pathname: string, filter: NovaTagFilter) {
  const query = withNovaTagFilter("", filter).toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function novaTagFilterShareUrl(currentUrl: string) {
  const url = new URL(currentUrl);
  url.searchParams.delete("create");
  url.searchParams.delete("deleting");
  return url.toString();
}

export function serverMatchesNovaTagFilter(
  serverTags: readonly string[],
  filter: NovaTagFilter,
) {
  const tags = new Set(serverTags);
  return filter.mode === "all"
    ? filter.tags.every((tag) => tags.has(tag))
    : filter.tags.some((tag) => tags.has(tag));
}
