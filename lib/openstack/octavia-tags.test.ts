import { describe, expect, it } from "vitest";

import {
  OCTAVIA_MAX_RESOURCE_TAGS,
  validateOctaviaTags,
} from "@/lib/openstack/octavia-tags";

describe("Octavia resource tags", () => {
  it("preserves valid opaque tags", () => {
    const tags = ["env:test", "Team:Platform", " leading space"];

    expect(validateOctaviaTags(tags)).toEqual({ ok: true, tags });
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
