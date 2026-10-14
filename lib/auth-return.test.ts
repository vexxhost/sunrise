import { describe, expect, it } from "vitest";
import { normalizeAuthReturnTo } from "@/lib/auth-return";

describe("normalizeAuthReturnTo", () => {
  it("preserves local application paths, queries, and hashes", () => {
    expect(
      normalizeAuthReturnTo(
        "/object-storage/buckets/example?prefix=reports%2F#objects",
      ),
    ).toBe("/object-storage/buckets/example?prefix=reports%2F#objects");
  });

  it("preserves the complete shared console destination", () => {
    expect(
      normalizeAuthReturnTo(
        "/console/297c1aa4ef4f42bf9fdb6a7c6ced78b2/7b4aac0f-e01e-443a-aa20-f5b0a93ab525?protocol=vnc&region=RegionOne",
      ),
    ).toBe(
      "/console/297c1aa4ef4f42bf9fdb6a7c6ced78b2/7b4aac0f-e01e-443a-aa20-f5b0a93ab525?protocol=vnc&region=RegionOne",
    );
  });

  it.each([
    undefined,
    null,
    "",
    "https://attacker.example/object-storage",
    "//attacker.example/object-storage",
    "/auth/logout",
    "/sign-in/demo?returnTo=%2Fcompute%2Finstances",
    "/object-storage/auth/refresh",
    "/_next/static/chunk.js",
    `/${"a".repeat(600)}`,
  ])("falls back to the overview for %s", (value) => {
    expect(normalizeAuthReturnTo(value)).toBe("/");
  });
});
