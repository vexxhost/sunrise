import { describe, expect, it } from "vitest";

import {
  clusterApiAssociationNeedsFloatingIps,
  formatOctaviaStatus,
  isClusterApiLoadBalancer,
  octaviaEndpointHost,
  parseOctaviaFloatingIpAttachments,
} from "@/lib/openstack/octavia";

describe("Octavia presentation helpers", () => {
  it("formats API status values for display", () => {
    expect(formatOctaviaStatus("PENDING_UPDATE")).toBe("Pending Update");
    expect(formatOctaviaStatus(undefined)).toBe("Unknown");
  });

  it("extracts IPv4 and IPv6 hosts from API endpoints", () => {
    expect(octaviaEndpointHost("https://10.10.230.118:6443")).toBe(
      "10.10.230.118",
    );
    expect(octaviaEndpointHost("https://[2001:db8::10]:6443")).toBe(
      "2001:db8::10",
    );
    expect(octaviaEndpointHost("not a URL")).toBeNull();
  });

  it("matches a cluster API through its private VIP or public floating IP", () => {
    const hosts = new Set(["10.10.230.118", "10.13.55.237"]);
    const floatingIps = new Map([["vip-port", "10.13.55.237"]]);

    expect(
      isClusterApiLoadBalancer(
        { vip_address: "10.10.230.118" },
        hosts,
        floatingIps,
      ),
    ).toBe(true);
    expect(
      isClusterApiLoadBalancer(
        { vip_address: "10.10.230.99", vip_port_id: "vip-port" },
        hosts,
        floatingIps,
      ),
    ).toBe(true);
    expect(
      isClusterApiLoadBalancer(
        { vip_address: "10.10.230.99", vip_port_id: "other-port" },
        hosts,
        floatingIps,
      ),
    ).toBe(false);
  });

  it("requires floating IP data only for API endpoints that do not match VIPs", () => {
    const loadBalancers = [
      { vip_address: "10.10.230.118" },
      { vip_address: "2001:db8::10" },
    ];

    expect(
      clusterApiAssociationNeedsFloatingIps(
        loadBalancers,
        new Set(["10.10.230.118", "2001:db8::10"]),
      ),
    ).toBe(false);
    expect(
      clusterApiAssociationNeedsFloatingIps(
        loadBalancers,
        new Set(["10.13.55.237"]),
      ),
    ).toBe(true);
  });

  it("accepts only complete Neutron floating IP list payloads", () => {
    expect(
      parseOctaviaFloatingIpAttachments({
        floatingips: [
          {
            floating_ip_address: "10.13.55.237",
            port_id: "vip-port",
          },
          {
            floating_ip_address: "10.13.55.238",
            port_id: null,
          },
        ],
      }),
    ).toEqual([
      { floating_ip_address: "10.13.55.237", port_id: "vip-port" },
      { floating_ip_address: "10.13.55.238", port_id: null },
    ]);
    expect(parseOctaviaFloatingIpAttachments(null)).toBeNull();
    expect(parseOctaviaFloatingIpAttachments({})).toBeNull();
    expect(
      parseOctaviaFloatingIpAttachments({ floatingips: [null] }),
    ).toBeNull();
    expect(
      parseOctaviaFloatingIpAttachments({
        floatingips: [{ floating_ip_address: 123 }],
      }),
    ).toBeNull();
  });
});
