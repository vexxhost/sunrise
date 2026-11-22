export const NOVA_MAX_SERVER_TAGS = 50;
export const NOVA_MAX_SERVER_TAG_LENGTH = 60;

export type NovaTagsValidationResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: string };

export function novaTagLength(value: string) {
  return Array.from(value).length;
}

export function encodeNovaTagForEditor(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\r", "\\r");
}

export function decodeNovaTagFromEditor(value: string) {
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

export function formatNovaTag(value: string) {
  return value.length > 0 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : JSON.stringify(value);
}

export function validateNovaTags(tags: string[]): NovaTagsValidationResult {
  if (tags.length > NOVA_MAX_SERVER_TAGS) {
    return {
      ok: false,
      error: `An instance can have at most ${NOVA_MAX_SERVER_TAGS} tags.`,
    };
  }

  return validateNovaTagValues(tags);
}

export function validateNovaTagValues(
  tags: string[],
): NovaTagsValidationResult {
  const seen = new Set<string>();
  for (const tag of tags) {
    if (tag.length === 0) {
      return { ok: false, error: "Tags cannot be empty." };
    }
    if (novaTagLength(tag) > NOVA_MAX_SERVER_TAG_LENGTH) {
      return {
        ok: false,
        error: `Each tag must be ${NOVA_MAX_SERVER_TAG_LENGTH} characters or fewer.`,
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
        error: `Remove the duplicate tag ${formatNovaTag(tag)}.`,
      };
    }
    seen.add(tag);
  }

  return { ok: true, tags };
}

export function sameNovaTags(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  if (new Set(left).size !== left.length) return false;
  if (new Set(right).size !== right.length) return false;
  const rightTags = new Set(right);
  return left.every((tag) => rightTags.has(tag));
}
