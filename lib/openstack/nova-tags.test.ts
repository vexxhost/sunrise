import { describe, expect, it } from "vitest";

import {
  decodeNovaTagFromEditor,
  encodeNovaTagForEditor,
  sameNovaTags,
  validateNovaTags,
} from "@/lib/openstack/nova-tags";

describe("Nova server tags", () => {
  it("preserves exact opaque values within Nova's limits", () => {
    const tags = [" env:test ", "line\nbreak", "😀".repeat(60)];

    expect(validateNovaTags(tags)).toEqual({ ok: true, tags });
  });

  it.each([
    [[""], "Tags cannot be empty."],
    [["a".repeat(61)], "Each tag must be 60 characters or fewer."],
    [["path/value"], "Tags cannot contain a slash (/)."],
    [["env:test,team:cloud"], "Tags cannot contain a comma (,)."],
    [["same", "same"], "Remove the duplicate tag same."],
    [Array.from({ length: 51 }, (_, index) => `tag-${index}`), "at most 50"],
  ] as const)("rejects invalid tags", (tags, message) => {
    const result = validateNovaTags([...tags]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it("round-trips carriage returns and literal backslashes in the editor", () => {
    const tag = "before\\value\rafter";

    expect(decodeNovaTagFromEditor(encodeNovaTagForEditor(tag))).toBe(tag);
  });

  it("compares tag sets without treating order as a change", () => {
    expect(sameNovaTags(["one", "two"], ["two", "one"])).toBe(true);
    expect(sameNovaTags(["one"], ["two"])).toBe(false);
    expect(sameNovaTags(["one", "one"], ["one", "two"])).toBe(false);
    expect(sameNovaTags(["one", "two"], ["one", "one"])).toBe(false);
  });
});
