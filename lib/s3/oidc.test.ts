import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MAX_OBJECT_STORAGE_RETURN_TO_LENGTH,
  normalizeObjectStorageReturnTo,
  OBJECT_STORAGE_HOME_PATH,
} from "@/lib/s3/oidc";

describe("normalizeObjectStorageReturnTo", () => {
  it("preserves nested Object Storage routes, queries, and hashes", () => {
    expect(
      normalizeObjectStorageReturnTo(
        "/object-storage/buckets?create=bucket#bucket-list",
      ),
    ).toBe("/object-storage/buckets?create=bucket#bucket-list");
    expect(normalizeObjectStorageReturnTo("/object-storage/roles")).toBe(
      "/object-storage/roles",
    );
  });

  it("bounds cookie-backed targets while preserving their section", () => {
    const longObjectPath = `/object-storage/buckets/example/object/${"a".repeat(
      MAX_OBJECT_STORAGE_RETURN_TO_LENGTH,
    )}`;
    const longRoleQuery = `/object-storage/roles?filter=${"b".repeat(
      MAX_OBJECT_STORAGE_RETURN_TO_LENGTH,
    )}`;

    expect(normalizeObjectStorageReturnTo(longObjectPath)).toBe(
      "/object-storage/buckets",
    );
    expect(normalizeObjectStorageReturnTo(longRoleQuery)).toBe(
      "/object-storage/roles",
    );
  });

  it.each([
    undefined,
    null,
    "",
    "https://attacker.example/object-storage/buckets",
    "//attacker.example/object-storage/buckets",
    "/compute/instances",
    "/object-storage-fake",
    "/object-storage/auth/login",
    "/object-storage/auth/callback",
  ])("falls back to the Object Storage overview for %s", (value) => {
    expect(normalizeObjectStorageReturnTo(value)).toBe(
      OBJECT_STORAGE_HOME_PATH,
    );
  });
});
