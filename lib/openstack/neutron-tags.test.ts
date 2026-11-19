import { describe, expect, it } from "vitest";

import {
  NEUTRON_MAX_TAG_LENGTH,
  NEUTRON_MAX_TAGS,
  formatNeutronTag,
  neutronTagLength,
  sameNeutronTags,
  validateNeutronTags,
} from "@/lib/openstack/neutron-tags";

describe("Neutron resource tags", () => {
  it("preserves every tag value exactly", () => {
    expect(
      validateNeutronTags(["", " production ", "line\nbreak", "a,b"]),
    ).toEqual({
      ok: true,
      tags: ["", " production ", "line\nbreak", "a,b"],
    });
    expect(formatNeutronTag("production")).toBe("production");
    expect(formatNeutronTag(" production ")).toBe('" production "');
    expect(formatNeutronTag("line\nbreak")).toBe('"line\\nbreak"');
  });

  it("rejects exact duplicates while preserving case and whitespace", () => {
    expect(validateNeutronTags(["Production", "Production"])).toEqual({
      ok: false,
      error: "Remove the duplicate tag Production.",
    });
    expect(
      validateNeutronTags(["Production", "production", " Production "]),
    ).toEqual({
      ok: true,
      tags: ["Production", "production", " Production "],
    });
  });

  it("enforces Neutron's tag count and length limits", () => {
    const tooMany = Array.from(
      { length: NEUTRON_MAX_TAGS + 1 },
      (_, index) => `tag-${index}`,
    );
    expect(validateNeutronTags(tooMany)).toEqual({
      ok: false,
      error: `Enter no more than ${NEUTRON_MAX_TAGS} tags.`,
    });
    expect(
      validateNeutronTags(["x".repeat(NEUTRON_MAX_TAG_LENGTH + 1)]),
    ).toEqual({
      ok: false,
      error: `Each tag must be ${NEUTRON_MAX_TAG_LENGTH} characters or fewer.`,
    });
  });

  it("counts Unicode code points like Neutron instead of UTF-16 units", () => {
    const maximumEmojiTag = "😀".repeat(NEUTRON_MAX_TAG_LENGTH);
    expect(neutronTagLength(maximumEmojiTag)).toBe(NEUTRON_MAX_TAG_LENGTH);
    expect(validateNeutronTags([maximumEmojiTag])).toEqual({
      ok: true,
      tags: [maximumEmojiTag],
    });
    expect(
      validateNeutronTags(["😀".repeat(NEUTRON_MAX_TAG_LENGTH + 1)]),
    ).toMatchObject({ ok: false });
  });

  it("compares tag sets without making order significant", () => {
    expect(sameNeutronTags(["one", "two"], ["two", "one"])).toBe(true);
    expect(sameNeutronTags(["one"], ["one", "two"])).toBe(false);
  });
});
