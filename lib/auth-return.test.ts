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

  it.each([
    undefined,
    null,
    "",
    "https://attacker.example/object-storage",
    "//attacker.example/object-storage",
    "/auth/logout",
    "/object-storage/auth/refresh",
    "/_next/static/chunk.js",
    `/${"a".repeat(600)}`,
  ])("falls back to the overview for %s", (value) => {
    expect(normalizeAuthReturnTo(value)).toBe("/");
  });
});
