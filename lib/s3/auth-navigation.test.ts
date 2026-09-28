import { describe, expect, it } from "vitest";
import { objectStorageAuthRefreshHref } from "@/lib/s3/auth-navigation";

describe("objectStorageAuthRefreshHref", () => {
  it("carries the current Object Storage location through renewal", () => {
    expect(
      objectStorageAuthRefreshHref(
        "/object-storage/buckets/example?prefix=reports%2F",
      ),
    ).toBe(
      "/object-storage/auth/refresh?returnTo=%2Fobject-storage%2Fbuckets%2Fexample%3Fprefix%3Dreports%252F",
    );
  });
});
