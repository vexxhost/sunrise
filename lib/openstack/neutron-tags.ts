export const NEUTRON_MAX_TAGS = 50;
export const NEUTRON_MAX_TAG_LENGTH = 255;

export type NeutronTagsValidationResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: string };

export function neutronTagLength(value: string) {
  return Array.from(value).length;
}

export function encodeNeutronTagForEditor(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\r", "\\r");
}

export function decodeNeutronTagFromEditor(value: string) {
  let decoded = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (character === "\\" && (next === "\\" || next === "r")) {
      decoded += next === "r" ? "\r" : "\\";
      index += 1;
    } else {
      decoded += character;
    }
  }

  return decoded;
}

export function formatNeutronTag(value: string) {
  return value.length > 0 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : JSON.stringify(value);
}

export function validateNeutronTags(tags: string[]): NeutronTagsValidationResult {
  if (tags.length > NEUTRON_MAX_TAGS) {
    return {
      ok: false,
      error: `Enter no more than ${NEUTRON_MAX_TAGS} tags.`,
    };
  }

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
