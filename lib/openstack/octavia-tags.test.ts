import { describe, expect, it } from "vitest";

import {
  limitOctaviaTagInput,
  OCTAVIA_MAX_RESOURCE_TAGS,
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
