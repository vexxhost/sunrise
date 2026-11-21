export const GLANCE_TAG_FILTER_PARAM = "tag";
export const GLANCE_TAG_FILTER_MAX_TAGS = 128;
export const GLANCE_TAG_FILTER_MAX_TAG_LENGTH = 255;

export type GlanceTagFilter = {
  tags: string[];
};

export type GlanceTagFilterSearchParams = {
  [GLANCE_TAG_FILTER_PARAM]?: string | string[];
};

export type GlanceTagFilterParseResult = {
  filter?: GlanceTagFilter;
  error?: string;
};

function values(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function glanceTagFilterError(filter: GlanceTagFilter) {
  if (filter.tags.length === 0) return "Add at least one tag.";
  if (filter.tags.length > GLANCE_TAG_FILTER_MAX_TAGS) {
    return `Use no more than ${GLANCE_TAG_FILTER_MAX_TAGS} tag filters.`;
  }

  const seen = new Set<string>();
  for (const tag of filter.tags) {
    if (tag.length === 0) {
      return "Empty tags cannot be used in an image list filter.";
    }
    if (tag.length > GLANCE_TAG_FILTER_MAX_TAG_LENGTH) {
      return `Each tag filter must be ${GLANCE_TAG_FILTER_MAX_TAG_LENGTH} characters or fewer.`;
    }
    if (seen.has(tag)) {
      return `Remove the duplicate tag ${JSON.stringify(tag)}.`;
    }
    seen.add(tag);
  }

  const query = new URLSearchParams();
  for (const tag of filter.tags) {
    query.append(GLANCE_TAG_FILTER_PARAM, tag);
  }
  if (query.toString().length > 4_096) {
    return "The combined tag filter is too long. Remove some tags.";
  }
  return null;
}

export function parseGlanceTagFilterSearchParams(
  searchParams: GlanceTagFilterSearchParams,
): GlanceTagFilterParseResult {
  const tags = values(searchParams[GLANCE_TAG_FILTER_PARAM]);
  if (tags.length === 0) return {};

  const filter = { tags } satisfies GlanceTagFilter;
  const error = glanceTagFilterError(filter);
  return error ? { error } : { filter };
}

export function glanceTagFilterQueryKey(filter?: GlanceTagFilter) {
  return filter ? [...filter.tags] : [];
}

export function withGlanceTagFilter(
  searchParams: URLSearchParams | string,
  filter?: GlanceTagFilter,
) {
  const next = new URLSearchParams(searchParams);
  next.delete(GLANCE_TAG_FILTER_PARAM);
  if (!filter) return next;

  const error = glanceTagFilterError(filter);
  if (error) throw new Error(error);
  for (const tag of filter.tags) {
    next.append(GLANCE_TAG_FILTER_PARAM, tag);
  }
  return next;
}

export function glanceTagFilterApiPath(
  path: string,
  filter?: GlanceTagFilter,
) {
  if (!filter) return path;
  const query = withGlanceTagFilter("", filter).toString();
  return query ? `${path}?${query}` : path;
}

export function glanceTagFilterHref(
  pathname: string,
  filter: GlanceTagFilter,
) {
  const query = withGlanceTagFilter("", filter).toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function glanceTagFilterShareUrl(currentUrl: string) {
  const url = new URL(currentUrl);
  url.searchParams.delete("create");
  return url.toString();
}

export function imageMatchesGlanceTagFilter(
  imageTags: readonly string[],
  filter: GlanceTagFilter,
) {
  const tags = new Set(imageTags);
  return filter.tags.every((tag) => tags.has(tag));
}
