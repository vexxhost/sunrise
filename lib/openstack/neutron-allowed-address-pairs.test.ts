import { describe, expect, it } from "vitest";

import { isEntireIpv4AddressSpace } from "@/lib/openstack/neutron-allowed-address-pairs";

describe("isEntireIpv4AddressSpace", () => {
  it.each(["0.0.0.0/0", "192.0.2.1/0", "203.0.113.8/00"])(
    "recognizes %s as the entire IPv4 address space",
    (value) => {
      expect(isEntireIpv4AddressSpace(value)).toBe(true);
    },
  );

  it.each([
    "0.0.0.0/1",
    "192.0.2.1",
    "999.0.0.1/0",
    "192.168.001.1/0",
    "::/0",
    "not-an-address/0",
  ])("does not treat %s as a broad IPv4 CIDR", (value) => {
    expect(isEntireIpv4AddressSpace(value)).toBe(false);
  });
});
