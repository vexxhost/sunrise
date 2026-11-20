import { describe, expect, it } from "vitest";

import {
  getAllowedAddressPairMulticastErrors,
  hasRejectedMulticastAllowedAddressPair,
  isEntireIpv4AddressSpace,
  isMulticastIpAddressOrCidr,
  isMulticastMacAddress,
} from "@/lib/openstack/neutron-allowed-address-pairs";

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

describe("multicast allowed address pairs", () => {
  it.each([
    "224.0.0.1",
    "192.0.0.0/2",
    "239.255.255.255/32",
    "ff02::1",
    "fe00::/7",
    "ff00::/8",
    "::/0",
  ])("recognizes multicast IP ranges in %s", (value) => {
    expect(isMulticastIpAddressOrCidr(value)).toBe(true);
  });

  it.each([
    "0.0.0.0/0",
    "192.0.2.10",
    "223.255.255.0/24",
    "240.0.0.0/4",
    "2001:db8::/32",
    "not-an-address",
    "ff00::/",
    "ff00:0:0:0:0:0:0:0::/8",
  ])("does not reject the non-multicast value %s", (value) => {
    expect(isMulticastIpAddressOrCidr(value)).toBe(false);
  });

  it("recognizes the multicast bit in MAC addresses", () => {
    expect(isMulticastMacAddress("01:00:5e:00:00:01")).toBe(true);
    expect(isMulticastMacAddress("33:33:00:00:00:01")).toBe(true);
    expect(isMulticastMacAddress("fa:16:3e:00:00:01")).toBe(false);
    expect(isMulticastMacAddress("")).toBe(false);
    expect(isMulticastMacAddress("01")).toBe(false);
    expect(isMulticastMacAddress("01:not-a-mac")).toBe(false);
  });

  it("reports rejected fields without flagging the IPv4 /0 exception", () => {
    expect(
      getAllowedAddressPairMulticastErrors({
        ipAddress: "224.0.0.1",
        macAddress: "01:00:5e:00:00:01",
      }),
    ).toEqual({
      ipAddress:
        "Multicast IP addresses and overlapping CIDRs are not supported.",
      macAddress: "Multicast MAC addresses are not supported.",
    });
    expect(
      hasRejectedMulticastAllowedAddressPair([
        { ipAddress: "0.0.0.0/0", macAddress: "" },
      ]),
    ).toBe(false);
  });
});
