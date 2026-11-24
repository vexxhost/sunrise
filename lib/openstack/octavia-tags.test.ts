import { describe, expect, it } from "vitest";

import {
  formatOctaviaTag,
  limitOctaviaTagInput,
  OCTAVIA_MAX_RESOURCE_TAGS,
  sameOctaviaTags,
  validateOctaviaTags,
} from "@/lib/openstack/octavia-tags";

describe("Octavia resource tags", () => {
  it("preserves valid opaque tags", () => {
    const tags = ["env:test", "Team:Platform", " leading space"];

    expect(validateOctaviaTags(tags)).toEqual({ ok: true, tags });
  });

  it("limits editor input by Unicode code points", () => {
    expect(limitOctaviaTagInput("😀".repeat(61))).toBe("😀".repeat(60));
    expect(limitOctaviaTagInput("a".repeat(61))).toBe("a".repeat(60));
    expect(validateOctaviaTags(["😀".repeat(60)])).toEqual({
      ok: true,
      tags: ["😀".repeat(60)],
    });
  });

  it("formats ambiguous values and compares tags as an unordered set", () => {
    expect(formatOctaviaTag(" visible ")).toBe('" visible "');
    expect(formatOctaviaTag("line\nbreak")).toBe('"line\\nbreak"');
    expect(
      sameOctaviaTags(["env:test", "team:one"], ["team:one", "env:test"]),
    ).toBe(true);
    expect(sameOctaviaTags(["env:test"], ["env:prod"])).toBe(false);
    expect(sameOctaviaTags(["a", "a"], ["a", "b"])).toBe(false);
  });

  it.each([
    [[""], "empty"],
    [["path/value"], "slash"],
    [["one,two"], "comma"],
    [["same", "same"], "duplicate"],
    [["😀".repeat(61)], "60 characters"],
    [
      Array.from(
        { length: OCTAVIA_MAX_RESOURCE_TAGS + 1 },
        (_, index) => `tag-${index}`,
      ),
      "at most 50",
    ],
  ] as const)("rejects invalid tags", (tags, message) => {
    const result = validateOctaviaTags([...tags]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});
