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

function embeddedFlavor(
  overrides: Partial<Server["flavor"]> = {},
): Partial<Server["flavor"]> {
  return {
    original_name: "m1.small",
    vcpus: 1,
    ram: 2048,
    disk: 20,
    ephemeral: 0,
    swap: 0,
    ...overrides,
  };
}

describe("resolveServerFlavor", () => {
  it("uses the embedded flavor ID when Nova includes it", () => {
    expect(
      resolveServerFlavor(
        serverFlavor({
          ...embeddedFlavor(),
          id: "flavor-id",
        } as Partial<Server["flavor"]>),
        [flavor()],
      ),
    ).toEqual({ id: "flavor-id", name: "m1.small" });
  });

  it("resolves one exact-name flavor with matching embedded capacity", () => {
    expect(
      resolveServerFlavor(
        serverFlavor(embeddedFlavor()),
        [flavor()],
      ),
    ).toEqual({ id: "flavor-id", name: "m1.small" });
  });

  it("keeps an unknown custom flavor non-addressable", () => {
    expect(
      resolveServerFlavor(
        serverFlavor(embeddedFlavor({ original_name: "custom-capacity" })),
        [flavor()],
      ),
    ).toEqual({ id: undefined, name: "custom-capacity" });
  });

  it("does not link a reused flavor name with different capacity", () => {
    expect(
      resolveServerFlavor(
        serverFlavor(embeddedFlavor({ ram: 4096 })),
        [flavor()],
      ),
    ).toEqual({ id: undefined, name: "m1.small" });
  });

  it("does not infer identity from a case-insensitive name match", () => {
    expect(
      resolveServerFlavor(
        serverFlavor(embeddedFlavor({ original_name: "M1.SMALL" })),
        [flavor()],
      ),
    ).toEqual({ id: undefined, name: "M1.SMALL" });
  });

  it("does not link when more than one current flavor matches", () => {
    expect(
      resolveServerFlavor(
        serverFlavor(embeddedFlavor()),
        [flavor(), flavor({ id: "duplicate-id" })],
      ),
    ).toEqual({ id: undefined, name: "m1.small" });
  });

  it("does not link an embedded ID that is no longer available", () => {
    expect(
      resolveServerFlavor(
        serverFlavor({
          ...embeddedFlavor(),
          id: "deleted-flavor-id",
        } as Partial<Server["flavor"]>),
        [flavor()],
      ),
    ).toEqual({ id: undefined, name: "m1.small" });
  });
});
