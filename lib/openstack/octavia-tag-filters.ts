import { validateOctaviaTags } from "@/lib/openstack/octavia-tags";
import type { OctaviaLoadBalancer } from "@/types/openstack";

const TAG_PARAM = "tag";
const MODE_PARAM = "tag-mode";

export type OctaviaTagFilter = { mode: "all" | "any"; tags: string[] };

export type OctaviaTagFilterSearchParams = {
  [TAG_PARAM]?: string | string[];
  [MODE_PARAM]?: string | string[];
};

export function octaviaTagFilterError({ tags }: OctaviaTagFilter) {
  if (!tags.length) return "Add at least one tag.";
  const checked = validateOctaviaTags(tags);
  if (!checked.ok) return checked.error;
  if (
    encodeOctaviaTagFilter("", { mode: "any", tags }).toString().length > 4_096
  ) {
    return "The combined tag filter is too long. Remove some tags.";
  }
  return null;
}

export function parseOctaviaTagFilterSearchParams({
  [TAG_PARAM]: tag,
  [MODE_PARAM]: requestedMode,
}: OctaviaTagFilterSearchParams): {
  filter?: OctaviaTagFilter;
  error?: string;
} {
  if (tag === undefined && requestedMode === undefined) return {};
  const mode = requestedMode ?? "all";
  if (mode !== "all" && mode !== "any") {
    return { error: "Select one tag matching mode: All tags or Any tag." };
  }
  const filter: OctaviaTagFilter = {
    mode,
    tags: typeof tag === "string" ? [tag] : (tag ?? []),
  };
  const error = octaviaTagFilterError(filter);
  return error ? { error } : { filter };
}

function encodeOctaviaTagFilter(search: string, filter?: OctaviaTagFilter) {
  const next = new URLSearchParams(search);
  next.delete(TAG_PARAM);
  next.delete(MODE_PARAM);
  for (const tag of filter?.tags ?? []) next.append(TAG_PARAM, tag);
  if (filter?.mode === "any") next.set(MODE_PARAM, filter.mode);
  return next;
}

export function withOctaviaTagFilter(
  search: string,
  filter?: OctaviaTagFilter,
) {
  if (filter) {
    const error = octaviaTagFilterError(filter);
    if (error) throw new Error(error);
  }
  return encodeOctaviaTagFilter(search, filter);
}

export function octaviaTagFilterShareUrl(currentUrl: string) {
  const url = new URL(currentUrl);
  url.searchParams.delete("create");
  return url.toString();
}

export function loadBalancerMatchesTagFilter(
  { tags }: Pick<OctaviaLoadBalancer, "tags">,
  filter: OctaviaTagFilter,
) {
  if (!Array.isArray(tags)) return false;
  const contains = (tag: string) => tags.includes(tag);
  return filter.mode === "all"
    ? filter.tags.every(contains)
    : filter.tags.some(contains);
}
