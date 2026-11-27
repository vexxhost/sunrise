import { describe, expect, it, vi } from "vitest";

import {
  canDeleteLoadBalancer,
  canUpdateLoadBalancer,
  clusterApiHostsNeedingFloatingIps,
  formatOctaviaStatus,
  indexFloatingIpAddressesByPort,
  isClusterApiLoadBalancer,
  octaviaEndpointHost,
  octaviaTopologyRefetchInterval,
} from "@/lib/openstack/octavia";

describe("Octavia presentation helpers", () => {
  it("keeps polling through transient topology errors only in the post-write window", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(60_000);
    try {
      const failedRead = { changedAt: 60_000, failed: true, pending: true };
      expect(octaviaTopologyRefetchInterval(failedRead)).toBe(5_000);
      now.mockReturnValue(79_999);
      expect(octaviaTopologyRefetchInterval(failedRead)).toBe(5_000);
      now.mockReturnValue(80_000);
      expect(octaviaTopologyRefetchInterval(failedRead)).toBe(false);
      expect(
        octaviaTopologyRefetchInterval({ ...failedRead, failed: false }),
      ).toBe(5_000);
      expect(
        octaviaTopologyRefetchInterval({ failed: true, pending: true }),
      ).toBe(false);
      expect(octaviaTopologyRefetchInterval({ failed: false })).toBe(false);
    } finally {
      now.mockRestore();
    }
  });

  it("formats API status values for display", () => {
    expect(formatOctaviaStatus("PENDING_UPDATE")).toBe("Pending Update");
    expect(formatOctaviaStatus(undefined)).toBe("Unknown");
  });

  it("permits mutations only when Octavia is idle and dependencies allow it", () => {
    expect(canUpdateLoadBalancer({ provisioning_status: "ACTIVE" })).toBe(true);
    expect(
      canUpdateLoadBalancer({ provisioning_status: "PENDING_UPDATE" }),
    ).toBe(false);
    expect(
      canDeleteLoadBalancer({
        listeners: [],
        pools: [],
        provisioning_status: "ERROR",
      }),
    ).toBe(true);
    expect(
      canDeleteLoadBalancer({
        listeners: [{ id: "listener" }],
        pools: [],
        provisioning_status: "ACTIVE",
      }),
    ).toBe(false);
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
