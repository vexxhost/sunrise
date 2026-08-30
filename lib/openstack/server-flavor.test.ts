import { describe, expect, it } from "vitest";

import { resolveServerFlavor } from "@/lib/openstack/server-flavor";
import type { Flavor, Server } from "@/types/openstack";

function flavor(overrides: Partial<Flavor> = {}): Flavor {
  return {
    id: "flavor-id",
    name: "m1.small",
    vcpus: 1,
    ram: 2048,
    disk: 20,
    "OS-FLV-EXT-DATA:ephemeral": 0,
    swap: "",
    rxtx_factor: 1,
    "os-flavor-access:is_public": true,
    "OS-FLV-DISABLED:disabled": false,
    links: [],
    ...overrides,
  };
}

function serverFlavor(value: Partial<Server["flavor"]>): Server {
  return {
    flavor: value as Server["flavor"],
  } as Server;
}

describe("resolveServerFlavor", () => {
  it("uses the embedded flavor ID when Nova includes it", () => {
    expect(
      resolveServerFlavor(
        serverFlavor({
          id: "flavor-id",
          original_name: "m1.small",
        } as Partial<Server["flavor"]>),
        [flavor()],
      ),
    ).toEqual({ id: "flavor-id", name: "m1.small" });
  });

  it("resolves a modern embedded flavor by its original name", () => {
    expect(
      resolveServerFlavor(
        serverFlavor({ original_name: "m1.small" }),
        [flavor()],
      ),
    ).toEqual({ id: "flavor-id", name: "m1.small" });
  });

  it("keeps an unknown custom flavor non-addressable", () => {
    expect(
      resolveServerFlavor(
        serverFlavor({ original_name: "custom-capacity" }),
        [flavor()],
      ),
    ).toEqual({ id: undefined, name: "custom-capacity" });
  });
});
