import { describe, expect, it } from "vitest";
import { fixedVipAddressError } from "./octavia-vip-address";

describe("Octavia fixed VIP validation", () => {
  it.each([
    ["10.0.0.64/27", "10.0.0.94", true],
    ["10.0.0.64/27", "10.0.0.96", false],
    ["198.51.100.32/32", "198.51.100.32", true],
    ["198.51.100.32/32", "198.51.100.33", false],
    ["128.0.0.0/1", "203.0.113.72", true],
    ["128.0.0.0/1", "127.0.0.1", false],
    ["0.0.0.0/0", "203.0.113.72", true],
  ])(
    "checks membership for subnet %s and address %s",
    (cidr, address, valid) => {
      expect(
        fixedVipAddressError(address, { cidr, ip_version: 4 }) === null,
      ).toBe(valid);
    },
  );

  it("allows automatic allocation on IPv6 and rejects a fixed IPv4 address there", () => {
    const subnet = { cidr: "2001:db8::/64", ip_version: 6 } as const;
    expect(fixedVipAddressError(" ", subnet)).toBeNull();
    expect(fixedVipAddressError("10.0.0.72", subnet)).toContain(
      "automatic allocation on an IPv6 subnet",
    );
  });

  it("explicitly rejects a CIDR in place of the VIP address", () => {
    expect(
      fixedVipAddressError("10.0.0.72/32", {
        cidr: "10.0.0.0/24",
        ip_version: 4,
      }),
    ).toContain("without a CIDR prefix");
  });

  it("cannot confirm membership when Neutron does not report a valid subnet CIDR", () => {
    expect(
      fixedVipAddressError("10.0.0.72", { cidr: "", ip_version: 4 }),
    ).toContain("did not report a valid IPv4 CIDR");
  });
});
