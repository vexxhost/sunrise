import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getServicePolicy } from "@/lib/deployment-config";
import { isServiceEnabled } from "@/lib/service-policy";

describe("deployment service policy", () => {
  it("discovers normalized per-region environment variables", () => {
    const policy = getServicePolicy({
      SUNRISE_DISABLED_SERVICES: "key-manager",
      SUNRISE_DISABLED_SERVICES_REGION_ONE: "object-storage-s3,dns",
      SUNRISE_OBJECT_STORAGE_BACKENDS: "s3,swift",
    });

    expect(isServiceEnabled(policy, "key-manager", "RegionTwo")).toBe(false);
    expect(isServiceEnabled(policy, "dns", "Region-One")).toBe(false);
    expect(isServiceEnabled(policy, "dns", "RegionTwo")).toBe(true);
    expect(policy.objectStorageBackends).toEqual(["s3", "swift"]);
  });

  it("uses Swift when no Object Storage backend is configured", () => {
    expect(getServicePolicy({}).objectStorageBackends).toEqual(["swift"]);
  });
});
