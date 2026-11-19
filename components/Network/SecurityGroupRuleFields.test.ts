import { describe, expect, it } from "vitest";

import { securityRuleProtocolUsesPorts } from "@/components/Network/SecurityGroupRuleFields";

describe("security group rule protocol fields", () => {
  it("only keeps port ranges for protocols that use transport ports", () => {
    expect(securityRuleProtocolUsesPorts("tcp")).toBe(true);
    expect(securityRuleProtocolUsesPorts("udp")).toBe(true);
    expect(securityRuleProtocolUsesPorts("any")).toBe(false);
    expect(securityRuleProtocolUsesPorts("icmp")).toBe(false);
    expect(securityRuleProtocolUsesPorts("ipv6-icmp")).toBe(false);
  });
});
