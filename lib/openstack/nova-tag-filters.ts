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

const PYTHON_REGEX_ESCAPES = new Set([
  "A",
  "B",
  "D",
  "S",
  "W",
  "Z",
  "a",
  "b",
  "d",
  "f",
  "n",
  "r",
  "s",
  "t",
  "v",
  "w",
]);
const PYTHON_REGEX_CLASS_ESCAPES = new Set([
  "D",
  "S",
  "W",
  "a",
  "b",
  "d",
  "f",
  "n",
  "r",
  "s",
  "t",
  "v",
  "w",
]);

function hasHexDigits(value: string, start: number, length: number) {
  if (start + length > value.length) return false;
  for (let index = start; index < start + length; index += 1) {
    if (!/[0-9a-f]/i.test(value[index])) return false;
  }
  return true;
}

function isNovaRegexQueryRepresentable(value: string) {
  let inCharacterClass = false;
  let firstClassCharacter = -1;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\") {
      const escaped = value[index + 1];
      if (escaped === undefined) return false;
      if (/[a-z]/i.test(escaped)) {
        const hexLength = escaped === "x" ? 2 : escaped === "u" ? 4 : 0;
        if (escaped === "U") {
          if (!hasHexDigits(value, index + 2, 8)) return false;
          index += 9;
          continue;
        }
        if (hexLength > 0) {
          if (!hasHexDigits(value, index + 2, hexLength)) return false;
          index += hexLength + 1;
          continue;
        }
        const allowedEscapes = inCharacterClass
          ? PYTHON_REGEX_CLASS_ESCAPES
          : PYTHON_REGEX_ESCAPES;
        if (!allowedEscapes.has(escaped)) return false;
      } else if (/[1-9]/.test(escaped)) {
        // Numeric backreferences depend on Python's capture-group numbering.
        // Treat them conservatively instead of accepting a query JS parsed
        // differently from Nova.
        return false;
      }
      index += 1;
      continue;
    }

    if (!inCharacterClass && character === "[") {
      inCharacterClass = true;
      firstClassCharacter = value[index + 1] === "^" ? index + 2 : index + 1;
      continue;
    }
    if (inCharacterClass && character === "]") {
      if (index === firstClassCharacter) continue;
      inCharacterClass = false;
      continue;
    }
    if (
      !inCharacterClass &&
      character === "(" &&
      value.slice(index, index + 3) === "(?<" &&
      value[index + 3] !== "=" &&
      value[index + 3] !== "!"
    ) {
      // JavaScript named captures use (?<name>), while Python expects
      // (?P<name>) and rejects the JavaScript spelling used here.
      return false;
    }
  }

  if (inCharacterClass) return false;
  try {
    // Nova uses Python's re.compile. This checks the common syntax after the
    // Python-specific incompatibilities above have been excluded.
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

export function novaTagFilterError(filter: NovaTagFilter) {
  if (filter.mode !== "all" && filter.mode !== "any") {
    return "Select whether all tags or any tag must match.";
  }
  if (filter.tags.length === 0) return "Add at least one tag.";

  const parsed = validateNovaTagValues([...filter.tags]);
  if (!parsed.ok) return parsed.error;

  const apiQuery = novaTagFilterApiQueryUnchecked(filter);
  const joinedTags = Object.values(apiQuery)[0];
  if (!isNovaRegexQueryRepresentable(joinedTags)) {
    return "One or more tags cannot be represented in Nova's instance list filter.";
  }

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
