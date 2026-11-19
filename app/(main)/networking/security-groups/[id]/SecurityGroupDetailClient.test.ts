import { describe, expect, it } from "vitest";

import { securityGroupRuleRemoteType } from "@/app/(main)/networking/security-groups/[id]/SecurityGroupDetailClient";

describe("security group rule remote source", () => {
  it("distinguishes every Neutron remote source kind", () => {
    expect(
      securityGroupRuleRemoteType({
        remote_address_group_id: "address-group-a",
        remote_group_id: null,
        remote_ip_prefix: null,
      }),
    ).toBe("Address group");
    expect(
      securityGroupRuleRemoteType({
        remote_address_group_id: null,
        remote_group_id: "security-group-a",
        remote_ip_prefix: null,
      }),
    ).toBe("Security group");
    expect(
      securityGroupRuleRemoteType({
        remote_address_group_id: null,
        remote_group_id: null,
        remote_ip_prefix: "192.0.2.0/24",
      }),
    ).toBe("CIDR");
    expect(
      securityGroupRuleRemoteType({
        remote_address_group_id: null,
        remote_group_id: null,
        remote_ip_prefix: null,
      }),
    ).toBe("Unrestricted");
  });

  it("prefers the address group when malformed data contains two sources", () => {
    expect(
      securityGroupRuleRemoteType({
        remote_address_group_id: "address-group-a",
        remote_group_id: "security-group-a",
        remote_ip_prefix: "192.0.2.0/24",
      }),
    ).toBe("Address group");
  });
});
