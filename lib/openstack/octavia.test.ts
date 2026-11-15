import { describe, expect, it } from "vitest";

import {
  clusterApiHostsNeedingFloatingIps,
  formatOctaviaStatus,
  indexFloatingIpAddressesByPort,
  isClusterApiLoadBalancer,
  octaviaEndpointHost,
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
    const hosts = new Set(["10.10.230.118", "10.13.55.237", "2001:db8::10"]);
    const floatingIps = new Map([
      ["vip-port", new Set(["10.13.55.236", "10.13.55.237"])],
    ]);

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
        {
          additional_vips: [
            { ip_address: "2001:db8::10", subnet_id: "subnet-id" },
          ],
          vip_address: "10.10.230.99",
          vip_port_id: "other-port",
        },
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
      {
        additional_vips: [
          { ip_address: "2001:db8::10", subnet_id: "subnet-id" },
        ],
        vip_address: "10.10.230.119",
      },
    ];

    expect(
      clusterApiHostsNeedingFloatingIps(
        loadBalancers,
        new Set(["10.10.230.118", "10.13.55.237"]),
      ),
    ).toEqual(["10.13.55.237"]);
    expect(
      clusterApiHostsNeedingFloatingIps(
        loadBalancers,
        new Set(["10.10.230.118", "2001:db8::10"]),
      ),
    ).toEqual([]);
  });

  it("retains every unique floating IP attached to a VIP port", () => {
    expect(
      indexFloatingIpAddressesByPort([
        { floating_ip_address: "203.0.113.10", port_id: "vip-port" },
        { floating_ip_address: "203.0.113.11", port_id: "vip-port" },
        { floating_ip_address: "203.0.113.10", port_id: "vip-port" },
        { floating_ip_address: "203.0.113.12", port_id: null },
      ]),
    ).toEqual(
      new Map([["vip-port", new Set(["203.0.113.10", "203.0.113.11"])]]),
    );
  });

  it("ignores malformed optional additional VIP data", () => {
    expect(
      isClusterApiLoadBalancer(
        {
          additional_vips: {} as never,
          vip_address: "10.10.230.99",
        },
        new Set(["10.10.230.118"]),
        new Map(),
      ),
    ).toBe(false);
  });
});
