import { describe, expect, it } from "vitest";

import { parseNeutronAvailabilityZones } from "@/lib/openstack/neutron-availability-zones";

describe("Neutron availability zones", () => {
  it("parses a valid availability-zone catalog", () => {
    expect(
      parseNeutronAvailabilityZones({
        availability_zones: [
          { name: "nova-2", resource: "router", state: "available" },
          { name: "nova-1", resource: "network", state: "available" },
        ],
      }),
    ).toEqual([
      { name: "nova-2", resource: "router", state: "available" },
      { name: "nova-1", resource: "network", state: "available" },
    ]);
  });

  it.each([
    null,
    {},
    { availability_zones: {} },
    { availability_zones: [{ name: "nova", resource: "network" }] },
    { availability_zones: [{ name: "", resource: "network", state: "available" }] },
  ])("rejects a malformed availability-zone catalog", (payload) => {
    expect(parseNeutronAvailabilityZones(payload)).toEqual([]);
  });
});
