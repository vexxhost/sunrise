import { describe, expect, it } from "vitest";

import {
  detectIpVersion,
  getCidrPrefixLength,
  getCidrValidationError,
} from "@/lib/network-address";

describe("network address validation", () => {
  it("detects valid IPv4 and IPv6 addresses", () => {
    expect(detectIpVersion("10.20.30.1")).toBe(4);
    expect(detectIpVersion("2001:db8::1")).toBe(6);
    expect(detectIpVersion("2001:db8:0:1:2:3:4:5")).toBe(6);
  });

  it("rejects malformed addresses", () => {
    expect(detectIpVersion("10.20.30.999")).toBe(0);
    expect(detectIpVersion("010.20.30.1")).toBe(0);
    expect(detectIpVersion("2001:db8:::1")).toBe(0);
    expect(detectIpVersion("fe80::1%eth0")).toBe(0);
  });

  it("validates CIDR syntax and selected IP version", () => {
    expect(getCidrValidationError("10.20.30.0/24", 4)).toBeNull();
    expect(getCidrValidationError("2001:db8::/64", 6)).toBeNull();
    expect(getCidrValidationError("10.20.30.0/24", 6)).toBe(
      "Enter an IPv6 CIDR for the selected IP version.",
    );
    expect(getCidrValidationError("2001:db8::/129", 6)).toBe(
      "Enter a valid IPv6 CIDR, such as 2001:db8::/64.",
    );
  });

  it("enforces a /64 for automatic IPv6 address modes", () => {
    expect(
      getCidrValidationError("2001:db8::/56", 6, { require64: true }),
    ).toBe(
      "A /64 prefix is required for SLAAC and DHCPv6 stateless addressing.",
    );
    expect(
      getCidrValidationError("2001:db8::/64", 6, { require64: true }),
    ).toBeNull();
    expect(getCidrPrefixLength("2001:db8::/64")).toBe(64);
  });
});
