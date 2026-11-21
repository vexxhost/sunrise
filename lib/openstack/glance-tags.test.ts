import { describe, expect, it } from "vitest";

import {
  GLANCE_MAX_TAG_LENGTH,
  formatGlanceTag,
  glanceRequestTrimsTag,
  glanceTagLength,
} from "@/lib/openstack/glance-tags";

describe("Glance tag values", () => {
  it.each([" ordinary", "ordinary\u0085", "\u001cordinary", "ordinary\u001f"])(
    "detects a tag Glance request parsing would strip: %j",
    (tag) => {
      expect(glanceRequestTrimsTag(tag)).toBe(true);
    },
  );

  it("does not apply JavaScript-only trim semantics", () => {
    expect(glanceRequestTrimsTag("\ufeffordinary")).toBe(false);
    expect(glanceRequestTrimsTag("ordinary\u0085value")).toBe(false);
  });

  it("counts Unicode code points like Glance instead of UTF-16 units", () => {
    expect(glanceTagLength("😀".repeat(GLANCE_MAX_TAG_LENGTH))).toBe(
      GLANCE_MAX_TAG_LENGTH,
    );
  });

  it("quotes values whose boundaries or controls would be misleading", () => {
    expect(formatGlanceTag(" ordinary ")).toBe('" ordinary "');
    expect(formatGlanceTag("\u0085ordinary")).toBe('"\\u0085ordinary"');
    expect(formatGlanceTag("\ufeffordinary")).toBe('"\\ufeffordinary"');
    expect(formatGlanceTag("ordinary")).toBe("ordinary");
  });
});
