import { describe, expect, it } from "vitest";

import {
  isNeutronPortHardwareOffloadType,
  isNeutronPortNumaAffinityPolicy,
  neutronPortHardwareOffloadTypeLabel,
  neutronPortNumaAffinityPolicyLabel,
} from "@/lib/openstack/neutron-port-placement";

describe("Neutron port placement", () => {
  it("recognizes current NUMA policies including socket affinity", () => {
    expect(isNeutronPortNumaAffinityPolicy("required")).toBe(true);
    expect(isNeutronPortNumaAffinityPolicy("socket")).toBe(true);
    expect(isNeutronPortNumaAffinityPolicy("same-host")).toBe(false);
    expect(neutronPortNumaAffinityPolicyLabel("preferred")).toBe("Preferred");
  });

  it("preserves unknown NUMA policy values returned by Neutron", () => {
    expect(neutronPortNumaAffinityPolicyLabel("future-policy")).toBe(
      "future-policy",
    );
    expect(neutronPortNumaAffinityPolicyLabel(null)).toBe("Cloud default");
  });

  it("accepts only the current switchdev hardware offload type", () => {
    expect(isNeutronPortHardwareOffloadType("switchdev")).toBe(true);
    expect(isNeutronPortHardwareOffloadType("legacy-switchdev")).toBe(false);
    expect(neutronPortHardwareOffloadTypeLabel("switchdev")).toBe("Switchdev");
    expect(neutronPortHardwareOffloadTypeLabel("future-offload")).toBe(
      "future-offload",
    );
  });
});
