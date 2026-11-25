export {
  decodeTagFromEditor as decodeNeutronTagFromEditor,
  encodeTagForEditor as encodeNeutronTagForEditor,
} from "@/lib/openstack/tag-editor";

export const NEUTRON_MAX_TAG_LENGTH = 255;

export type NeutronTagsValidationResult =
  { ok: true; tags: string[] } | { ok: false; error: string };

export function neutronTagLength(value: string) {
  return Array.from(value).length;
}

export function formatNeutronTag(value: string) {
  return value.length > 0 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : JSON.stringify(value);
}

export function validateNeutronTags(
  tags: string[],
): NeutronTagsValidationResult {
  const seen = new Set<string>();
  for (const tag of tags) {
    if (neutronTagLength(tag) > NEUTRON_MAX_TAG_LENGTH) {
      return {
        ok: false,
        error: `Each tag must be ${NEUTRON_MAX_TAG_LENGTH} characters or fewer.`,
      };
    }
    if (seen.has(tag)) {
      return {
        ok: false,
        error: `Remove the duplicate tag ${formatNeutronTag(tag)}.`,
      };
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
