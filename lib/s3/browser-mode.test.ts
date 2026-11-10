import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { s3DirectBrowser } from "@/lib/s3/browser-mode";

describe("S3 direct browser configuration", () => {
  it.each([undefined, "", " false ", "FALSE"])(
    "defaults %s to server browser mode",
    (value) => {
      expect(s3DirectBrowser(value)).toBe(false);
    },
  );

  it.each(["true", " TRUE ", "True"])(
    "enables direct browser mode for %s",
    (value) => {
      expect(s3DirectBrowser(value)).toBe(true);
    },
  );

  it("rejects ambiguous values", () => {
    expect(() => s3DirectBrowser("yes")).toThrow(
      "SUNRISE_S3_DIRECT_BROWSER must be true or false",
    );
  });
});
