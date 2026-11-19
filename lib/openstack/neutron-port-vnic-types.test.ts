import { describe, expect, it } from "vitest";

import {
  isNeutronPortVnicType,
  neutronPortVnicTypeLabel,
} from "@/lib/openstack/neutron-port-vnic-types";

describe("Neutron port vNIC types", () => {
  it("recognizes and labels canonical Neutron values", () => {
    expect(isNeutronPortVnicType("direct-physical")).toBe(true);
    expect(neutronPortVnicTypeLabel("direct-physical")).toBe("Direct physical");
  });

  it("preserves unknown response values without accepting them as input", () => {
    expect(isNeutronPortVnicType("future-offload")).toBe(false);
    expect(neutronPortVnicTypeLabel("future-offload")).toBe("future-offload");
  });
});
