import { describe, expect, it } from "vitest";

import {
  getIpv6ConfigurationAttributes,
  getIpv6ConfigurationMode,
  usesIpv6AutoAddressing,
} from "@/lib/openstack/neutron-ipv6";

describe("Neutron IPv6 configuration", () => {
  it("maps Sunrise modes to Neutron address and RA attributes", () => {
    expect(getIpv6ConfigurationAttributes("slaac-openstack")).toEqual({
      ipv6_address_mode: "slaac",
      ipv6_ra_mode: "slaac",
    });
    expect(getIpv6ConfigurationAttributes("slaac-external")).toEqual({
      ipv6_address_mode: "slaac",
      ipv6_ra_mode: null,
    });
    expect(getIpv6ConfigurationAttributes("none")).toEqual({
      ipv6_address_mode: null,
      ipv6_ra_mode: null,
    });
  });

  it("restores the configuration mode returned by Neutron", () => {
    expect(getIpv6ConfigurationMode("slaac", "slaac")).toBe("slaac-openstack");
    expect(getIpv6ConfigurationMode("slaac", null)).toBe("slaac-external");
    expect(getIpv6ConfigurationMode("dhcpv6-stateful", "dhcpv6-stateful")).toBe(
      "dhcpv6-stateful",
    );
    expect(getIpv6ConfigurationMode(null, null)).toBe("none");
  });

  it("identifies modes that require an EUI-64-compatible /64", () => {
    expect(usesIpv6AutoAddressing("slaac-openstack")).toBe(true);
    expect(usesIpv6AutoAddressing("slaac-external")).toBe(true);
    expect(usesIpv6AutoAddressing("dhcpv6-stateless")).toBe(true);
    expect(usesIpv6AutoAddressing("dhcpv6-stateful")).toBe(false);
    expect(usesIpv6AutoAddressing("none")).toBe(false);
  });
});
