import { describe, expect, it } from "vitest";

import { hasNeutronAdministratorRole } from "@/lib/openstack/neutron-access";

describe("Neutron access helpers", () => {
  it("recognizes the administrator role used by Neutron's default policy", () => {
    expect(
      hasNeutronAdministratorRole([{ id: "admin-id", name: " Admin " }]),
    ).toBe(true);
    expect(
      hasNeutronAdministratorRole([{ id: "member-id", name: "member" }]),
    ).toBe(false);
    expect(hasNeutronAdministratorRole(undefined)).toBe(false);
  });
});
