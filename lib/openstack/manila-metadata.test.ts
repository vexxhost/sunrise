import { describe, expect, it } from "vitest";

import {
  formatManilaMetadata,
  parseManilaMetadata,
} from "@/lib/openstack/manila-metadata";

describe("Manila metadata", () => {
  it("parses string key-value pairs", () => {
    expect(parseManilaMetadata('{"environment":"test"}')).toEqual({
      value: { environment: "test" },
      errors: [],
    });
  });

  it("rejects values Manila cannot store", () => {
    expect(parseManilaMetadata('{"environment":1}')).toMatchObject({
      value: null,
      errors: ["Metadata values must be strings of at most 255 characters."],
    });
  });

  it("formats empty and populated metadata", () => {
    expect(formatManilaMetadata(undefined)).toBe("{}");
    expect(formatManilaMetadata({ environment: "test" })).toBe(
      '{\n  "environment": "test"\n}',
    );
  });
});
