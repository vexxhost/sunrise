import { describe, expect, it } from "vitest";

import {
  formatIpCount,
  ipCapacity,
  ipUsagePercentage,
  parseNetworkIpAvailability,
} from "@/lib/openstack/neutron-ip-availability";

function payload() {
  return {
    network_ip_availability: {
      network_id: "network-a",
      network_name: "private",
      project_id: "project-a",
      total_ips: 253,
      used_ips: 4,
      subnet_ip_availability: [
        {
          subnet_id: "subnet-a",
          subnet_name: "private-v4",
          ip_version: 4,
          cidr: "192.0.2.0/24",
          total_ips: 253,
          used_ips: 4,
        },
      ],
    },
  };
}

describe("Neutron network IP availability", () => {
  it("parses the base network and subnet counters", () => {
    expect(parseNetworkIpAvailability(payload(), "network-a")).toEqual({
      network_id: "network-a",
      network_name: "private",
      project_id: "project-a",
      tenant_id: undefined,
      total_ips: 253,
      used_ips: 4,
      ip_availability_details: undefined,
      subnet_ip_availability: [
        {
          subnet_id: "subnet-a",
          subnet_name: "private-v4",
          ip_version: 4,
          cidr: "192.0.2.0/24",
          total_ips: 253,
          used_ips: 4,
          ip_availability_details: undefined,
        },
      ],
    });
  });

  it("prefers detailed allocation-pool counters when available", () => {
    const response = payload();
    const details = {
      total_ips_in_subnet: 254,
      total_ips_in_allocation_pool: 240,
      used_ips_in_subnet: 7,
      used_ips_in_allocation_pool: 3,
    };
    const detailedResponse = {
      network_ip_availability: {
        ...response.network_ip_availability,
        ip_availability_details: details,
        subnet_ip_availability:
          response.network_ip_availability.subnet_ip_availability.map(
            (subnet) => ({ ...subnet, ip_availability_details: details }),
          ),
      },
    };

    const availability = parseNetworkIpAvailability(
      detailedResponse,
      "network-a",
    );
    expect(ipCapacity(availability)).toEqual({
      available: 237,
      total: 240,
      used: 3,
      usageExceedsCapacity: false,
    });
    expect(
      ipCapacity(availability.subnet_ip_availability[0]),
    ).toEqual({
      available: 237,
      total: 240,
      used: 3,
      usageExceedsCapacity: false,
    });
  });

  it("does not report negative capacity for legacy out-of-pool allocations", () => {
    expect(
      ipCapacity({ total_ips: 2, used_ips: 3 }),
    ).toEqual({
      available: 0,
      total: 2,
      used: 3,
      usageExceedsCapacity: true,
    });
    expect(
      ipUsagePercentage({
        available: 0,
        total: 2,
        used: 3,
        usageExceedsCapacity: true,
      }),
    ).toBe(100);
  });

  it("marks unsafe IPv6-sized counters as approximate", () => {
    expect(formatIpCount(18_446_744_073_709_552_000)).toMatch(/^~/);
    expect(formatIpCount(253)).toBe("253");
  });

  it("rejects malformed and mismatched responses", () => {
    expect(() =>
      parseNetworkIpAvailability(payload(), "network-b"),
    ).toThrow("another network");
    const invalid = payload();
    invalid.network_ip_availability.subnet_ip_availability[0].used_ips = -1;
    expect(() => parseNetworkIpAvailability(invalid, "network-a")).toThrow(
      "Invalid Neutron subnet IP availability response",
    );
  });
});
