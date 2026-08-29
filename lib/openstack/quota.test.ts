import { describe, expect, it } from "vitest";
import {
  parseCinderQuotaDetails,
  parseMagnumQuota,
  parseManilaQuotaDetails,
  parseNeutronLimits,
  parseNovaQuotaDetails,
  parseOctaviaQuotaDetails,
  quotaLevel,
  quotaPercentage,
} from "@/lib/openstack/quota";

describe("OpenStack quota parsing", () => {
  it("maps detailed Nova quotas, reservations, and MiB values", () => {
    const metrics = parseNovaQuotaDetails({
      quota_set: {
        instances: { in_use: 3, limit: 10, reserved: 1 },
        cores: { in_use: 6, limit: 20, reserved: 2 },
        ram: { in_use: 6144, limit: 51200, reserved: 1024 },
        server_groups: { in_use: 2, limit: 10, reserved: 0 },
        key_pairs: { in_use: 0, limit: 100, reserved: 0 },
      },
    });

    expect(
      metrics.map(({ id, used, limit, reserved, unit }) => ({
        id,
        used,
        limit,
        reserved,
        unit,
      })),
    ).toEqual([
      { id: "instances", used: 3, limit: 10, reserved: 1, unit: undefined },
      { id: "cores", used: 6, limit: 20, reserved: 2, unit: undefined },
      { id: "ram", used: 6, limit: 50, reserved: 1, unit: "GiB" },
      { id: "server_groups", used: 2, limit: 10, reserved: 0, unit: undefined },
      { id: "key_pairs", used: 0, limit: 100, reserved: 0, unit: undefined },
    ]);
  });

  it("maps detailed Cinder aggregate and optional quotas", () => {
    const metrics = parseCinderQuotaDetails({
      quota_set: {
        volumes: { in_use: 2, limit: 10, reserved: 1 },
        snapshots: { in_use: 1, limit: 10, reserved: 0 },
        gigabytes: { in_use: 120, limit: 1000, reserved: 20 },
        backups: { in_use: 1, limit: 10, reserved: 0 },
        backup_gigabytes: { in_use: 40, limit: 1000, reserved: 0 },
        groups: { in_use: 1, limit: 10, reserved: 0 },
      },
    });

    expect(metrics.map((item) => item.id)).toEqual([
      "volumes",
      "snapshots",
      "gigabytes",
      "backups",
      "backup_gigabytes",
      "groups",
    ]);
    expect(metrics[0]).toMatchObject({ used: 2, limit: 10, reserved: 1 });
    expect(metrics[2]).toMatchObject({
      used: 120,
      limit: 1000,
      reserved: 20,
      unit: "GiB",
    });
  });

  it("maps Manila detailed quota usage and reservations", () => {
    const detail = (in_use: number, limit: number, reserved = 0) => ({
      in_use,
      limit,
      reserved,
    });
    const metrics = parseManilaQuotaDetails({
      quota_set: {
        shares: detail(2, 50),
        gigabytes: detail(120, 1000, 10),
        snapshots: detail(1, 50),
        snapshot_gigabytes: detail(20, 1000),
        share_networks: detail(1, 10),
      },
    });

    expect(metrics.map((item) => item.id)).toEqual([
      "shares",
      "gigabytes",
      "snapshots",
      "snapshot_gigabytes",
      "share_networks",
    ]);
    expect(metrics[1]).toMatchObject({
      used: 120,
      limit: 1000,
      reserved: 10,
      unit: "GiB",
    });
  });

  it("combines the Magnum hard limit with paginated cluster usage", () => {
    expect(
      parseMagnumQuota({ resource: "Cluster", hard_limit: 20 }, 7)[0],
    ).toMatchObject({
      id: "clusters",
      used: 7,
      limit: 20,
      reserved: 0,
      href: "/kubernetes/clusters",
    });
  });

  it("resolves inherited Octavia limits without conflating service resources", () => {
    const metrics = parseOctaviaQuotaDetails(
      {
        quota: {
          loadbalancer: 5,
          listener: null,
          pool: null,
          member: 50,
          healthmonitor: null,
          l7policy: null,
          l7rule: 20,
        },
      },
      {
        quota: {
          loadbalancer: -1,
          listener: -1,
          pool: 10,
          member: -1,
          healthmonitor: -1,
          l7policy: 5,
          l7rule: -1,
        },
      },
      {
        loadbalancer: 2,
        listener: 3,
        pool: 2,
        member: 6,
        healthmonitor: 1,
        l7policy: 1,
        l7rule: 2,
      },
    );

    expect(
      metrics.map(({ id, used, limit, level }) => ({
        id,
        used,
        limit,
        level,
      })),
    ).toEqual([
      { id: "loadbalancer", used: 2, limit: 5, level: "normal" },
      { id: "listener", used: 3, limit: -1, level: "unlimited" },
      { id: "pool", used: 2, limit: 10, level: "normal" },
      { id: "member", used: 6, limit: 50, level: "normal" },
      { id: "healthmonitor", used: 1, limit: -1, level: "unlimited" },
      { id: "l7policy", used: 1, limit: 5, level: "normal" },
      { id: "l7rule", used: 2, limit: 20, level: "normal" },
    ]);
  });

  it("preserves Neutron reserved quota separately from usage", () => {
    const detail = (used: number, limit: number, reserved = 0) => ({
      used,
      limit,
      reserved,
    });
    const metrics = parseNeutronLimits({
      quota: {
        network: detail(2, 100),
        port: detail(8, 500, 2),
        router: detail(1, 10),
        floatingip: detail(1, 50),
        security_group: detail(3, 10),
        security_group_rule: detail(12, 100),
      },
    });

    expect(metrics.find((item) => item.id === "port")).toMatchObject({
      used: 8,
      limit: 500,
      reserved: 2,
    });
  });

  it("includes reservations in Neutron saturation and severity", () => {
    const metrics = parseNeutronLimits({
      quota: {
        network: { used: 79, limit: 100, reserved: 21 },
      },
    });
    const network = metrics[0];

    expect(network).toMatchObject({
      used: 79,
      reserved: 21,
      level: "critical",
    });
    expect(quotaPercentage(network)).toBe(100);
  });

  it("skips Neutron resources omitted by unsupported extensions", () => {
    const metrics = parseNeutronLimits({
      quota: {
        network: { used: 1, limit: 100, reserved: 0 },
        port: { used: 4, limit: 500, reserved: 0 },
      },
    });

    expect(metrics.map((item) => item.id)).toEqual(["network", "port"]);
  });

  it("still rejects malformed Neutron resources when they are present", () => {
    expect(() =>
      parseNeutronLimits({
        quota: {
          network: { used: 1, limit: 100 },
        },
      }),
    ).toThrow("Missing numeric quota field: reserved");
  });

  it("handles warning, critical, zero, and unlimited quotas", () => {
    expect(quotaLevel(8, 10)).toBe("warning");
    expect(quotaLevel(10, 10)).toBe("critical");
    expect(quotaLevel(0, 0)).toBe("normal");
    expect(quotaLevel(100, -1)).toBe("unlimited");
    expect(
      quotaPercentage({
        id: "example",
        label: "Example",
        used: 12,
        limit: 10,
        reserved: 0,
        href: "/",
        level: "critical",
      }),
    ).toBe(100);
  });

  it("rejects incomplete API payloads instead of showing fake zeroes", () => {
    expect(() => parseNovaQuotaDetails({ quota_set: {} })).toThrow(
      "Invalid Nova instances quota payload",
    );
  });
});
