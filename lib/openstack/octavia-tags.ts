export const OCTAVIA_MAX_RESOURCE_TAGS = 50;
export const OCTAVIA_MAX_RESOURCE_TAG_LENGTH = 60;

export type OctaviaTagsValidationResult =
  { ok: true; tags: string[] } | { ok: false; error: string };

export function limitOctaviaTagInput(value: string) {
  return Array.from(value).slice(0, OCTAVIA_MAX_RESOURCE_TAG_LENGTH).join("");
}

export function formatOctaviaTag(tag: string) {
  return tag.length > 0 &&
    tag === tag.trim() &&
    !/[\u0000-\u001f\u007f]/.test(tag)
    ? tag
    : JSON.stringify(tag);
}

export function validateOctaviaTags(
  tags: string[],
): OctaviaTagsValidationResult {
  if (tags.length > OCTAVIA_MAX_RESOURCE_TAGS) {
    return {
      ok: false,
      error: `A load balancer can have at most ${OCTAVIA_MAX_RESOURCE_TAGS} tags.`,
    };
  }

  const seen = new Set<string>();
  for (const tag of tags) {
    if (tag.length === 0) {
      return { ok: false, error: "Tags cannot be empty." };
    }
    if (Array.from(tag).length > OCTAVIA_MAX_RESOURCE_TAG_LENGTH) {
      return {
        ok: false,
        error: `Each tag must be ${OCTAVIA_MAX_RESOURCE_TAG_LENGTH} characters or fewer.`,
      };
    }
    if (tag.includes("/")) {
      return { ok: false, error: "Tags cannot contain a slash (/)." };
    }
    if (tag.includes(",")) {
      return { ok: false, error: "Tags cannot contain a comma (,)." };
    }
    if (seen.has(tag)) {
      return {
        ok: false,
        error: `Remove the duplicate tag ${formatOctaviaTag(tag)}.`,
      };
    }
    seen.add(tag);
  }

  return { ok: true, tags };
}

export function sameOctaviaTags(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return [...left].sort().every((tag, index) => tag === sortedRight[index]);
}
