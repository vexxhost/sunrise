import { describe, expect, it } from "vitest";

import {
  flavorTotalDiskGiB,
  formatFlavorCapacity,
  formatFlavorRam,
} from "@/lib/openstack/flavor";
import type { Flavor } from "@/types/openstack";

function flavor(overrides: Partial<Flavor> = {}): Flavor {
  return {
    id: "m1-medium",
    name: "m1.medium",
    vcpus: 2,
    ram: 4096,
    disk: 40,
    "OS-FLV-EXT-DATA:ephemeral": 0,
    swap: 0,
    rxtx_factor: 1,
    "os-flavor-access:is_public": true,
    "OS-FLV-DISABLED:disabled": false,
    links: [],
    ...overrides,
  };
}

describe("flavor capacity formatting", () => {
  it("adds root and ephemeral storage for total disk", () => {
    expect(
      flavorTotalDiskGiB(flavor({ disk: 20, "OS-FLV-EXT-DATA:ephemeral": 10 })),
    ).toBe(30);
  });

  it("formats whole GiB and sub-GiB RAM without losing precision", () => {
    expect(formatFlavorRam(4096)).toBe("4 GiB");
    expect(formatFlavorRam(512)).toBe("512 MiB");
  });

  it("includes total disk in the compact select label", () => {
    expect(formatFlavorCapacity(flavor())).toBe(
      "m1.medium · 2 vCPU · 4 GiB RAM · 40 GiB disk",
    );
  });
});
