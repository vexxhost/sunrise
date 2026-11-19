import { describe, expect, it } from "vitest";

import {
  NEUTRON_MAX_TAG_LENGTH,
  NEUTRON_MAX_TAGS,
  parseNeutronTagsText,
  sameNeutronTags,
} from "@/lib/openstack/neutron-tags";

describe("Neutron resource tags", () => {
  it("parses trimmed, line-separated tags without treating commas specially", () => {
    expect(
      parseNeutronTagsText(
        " environment:production \n\nmanaged-by:terraform\nregion:one,two ",
      ),
    ).toEqual({
      ok: true,
      tags: [
        "environment:production",
        "managed-by:terraform",
        "region:one,two",
      ],
    });
  });

  it("rejects duplicate tags and preserves case sensitivity", () => {
    expect(parseNeutronTagsText("Production\nProduction")).toEqual({
      ok: false,
      error: "Remove the duplicate tag “Production”.",
    });
    expect(parseNeutronTagsText("Production\nproduction")).toEqual({
      ok: true,
      tags: ["Production", "production"],
    });
  });

  it("enforces Neutron's tag count and length limits", () => {
    const tooMany = Array.from(
      { length: NEUTRON_MAX_TAGS + 1 },
      (_, index) => `tag-${index}`,
    ).join("\n");
    expect(parseNeutronTagsText(tooMany)).toEqual({
      ok: false,
      error: `Enter no more than ${NEUTRON_MAX_TAGS} tags.`,
    });
    expect(
      parseNeutronTagsText("x".repeat(NEUTRON_MAX_TAG_LENGTH + 1)),
    ).toEqual({
      ok: false,
      error: `Each tag must be ${NEUTRON_MAX_TAG_LENGTH} characters or fewer.`,
    });
  });

  it("compares tag sets without making order significant", () => {
    expect(sameNeutronTags(["one", "two"], ["two", "one"])).toBe(true);
    expect(sameNeutronTags(["one"], ["one", "two"])).toBe(false);
  });
});
