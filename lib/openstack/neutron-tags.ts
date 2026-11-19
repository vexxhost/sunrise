export const NEUTRON_MAX_TAGS = 50;
export const NEUTRON_MAX_TAG_LENGTH = 255;

export type NeutronTagsParseResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: string };

export function parseNeutronTagsText(value: string): NeutronTagsParseResult {
  const tags = value
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (tags.length > NEUTRON_MAX_TAGS) {
    return {
      ok: false,
      error: `Enter no more than ${NEUTRON_MAX_TAGS} tags.`,
    };
  }

  const seen = new Set<string>();
  for (const tag of tags) {
    if (tag.length > NEUTRON_MAX_TAG_LENGTH) {
      return {
        ok: false,
        error: `Each tag must be ${NEUTRON_MAX_TAG_LENGTH} characters or fewer.`,
      };
    }
    if (seen.has(tag)) {
      return { ok: false, error: `Remove the duplicate tag “${tag}”.` };
    }
    seen.add(tag);
  }

  return { ok: true, tags };
}

export function sameNeutronTags(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightTags = new Set(right);
  return left.every((tag) => rightTags.has(tag));
}
