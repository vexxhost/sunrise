import { describe, expect, it } from "vitest";

import {
  cinderSnapshotQuotaImpacts,
  cinderVolumeQuotaImpacts,
  novaQuotaImpacts,
  quotaImpactIssues,
  quotaRequestImpacts,
} from "@/lib/openstack/quota-impact";
import type { QuotaMetric } from "@/lib/openstack/quota";
import type { Flavor } from "@/types/openstack";

function metric(
  id: string,
  used: number,
  limit: number,
  reserved = 0,
  unit?: "GiB",
): QuotaMetric {
  return {
    id,
    label: id.replaceAll("_", " "),
    used,
    limit,
    reserved,
    unit,
    href: "/quotas",
    level: limit < 0 ? "unlimited" : "normal",
  };
}

const flavor = {
  id: "small",
  name: "small",
  vcpus: 2,
  ram: 4096,
} as Flavor;

describe("creation quota impact", () => {
  it("includes reservations and instance count in Nova projections", () => {
    const impacts = novaQuotaImpacts(
      [
        metric("instances", 3, 10, 1),
        metric("cores", 8, 12),
        metric("ram", 8, 16, 0, "GiB"),
      ],
      flavor,
      2,
    );

    expect(
      impacts.map(({ metric: item, requested, projected, exceeds }) => ({
        id: item.id,
        requested,
        projected,
        exceeds,
      })),
    ).toEqual([
      { id: "instances", requested: 2, projected: 6, exceeds: false },
      { id: "cores", requested: 4, projected: 12, exceeds: false },
      { id: "ram", requested: 8, projected: 16, exceeds: false },
    ]);
  });

  it("marks a flavor unavailable when any requested resource exceeds quota", () => {
    const impacts = novaQuotaImpacts(
      [metric("instances", 3, 10), metric("cores", 8, 10)],
      flavor,
      2,
    );

    expect(
      impacts.find(({ metric: item }) => item.id === "cores")?.exceeds,
    ).toBe(true);
    expect(quotaImpactIssues(impacts)[0]).toContain("4 required");
  });

  it("checks Nova metadata as a per-instance limit", () => {
    const impacts = novaQuotaImpacts(
      [
        metric("instances", 3, 10),
        metric("cores", 2, 10),
        metric("metadata_items", 0, 2),
      ],
      flavor,
      1,
      3,
    );

    expect(impacts.at(-1)).toMatchObject({
      kind: "per-resource",
      projected: 3,
      exceeds: true,
    });
  });

  it("combines aggregate, per-volume, and explicit volume-type quotas", () => {
    const impacts = cinderVolumeQuotaImpacts(
      [
        metric("volumes", 2, 10, 1),
        metric("gigabytes", 100, 500, 25, "GiB"),
        metric("per_volume_gigabytes", 0, 100, 0, "GiB"),
        metric("volumes_fast", 4, 5),
        metric("gigabytes_fast", 170, 200, 0, "GiB"),
      ],
      40,
      "fast",
    );

    expect(
      impacts.map(({ metric: item, projected, exceeds, kind }) => ({
        id: item.id,
        projected,
        exceeds,
        kind,
      })),
    ).toEqual([
      {
        id: "volumes",
        projected: 4,
        exceeds: false,
        kind: "consumable",
      },
      {
        id: "gigabytes",
        projected: 165,
        exceeds: false,
        kind: "consumable",
      },
      {
        id: "per_volume_gigabytes",
        projected: 40,
        exceeds: false,
        kind: "per-resource",
      },
      {
        id: "volumes_fast",
        projected: 5,
        exceeds: false,
        kind: "consumable",
      },
      {
        id: "gigabytes_fast",
        projected: 210,
        exceeds: true,
        kind: "consumable",
      },
    ]);
  });

  it("does not block unlimited quotas", () => {
    const impacts = cinderVolumeQuotaImpacts(
      [metric("volumes", 100, -1), metric("gigabytes", 5000, -1, 0, "GiB")],
      500,
    );

    expect(
      impacts.every(({ exceeds, remaining }) => !exceeds && remaining === null),
    ).toBe(true);
  });

  it("maps direct resource requests without inventing absent metrics", () => {
    const impacts = quotaRequestImpacts(
      [metric("network", 9, 10), metric("port", 20, 100)],
      [
        { metricId: "network", requested: 1 },
        { metricId: "subnet", requested: 1 },
      ],
    );

    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({ projected: 10, exceeds: false });
  });

  it("checks snapshot counts without assuming deployment storage accounting", () => {
    const impacts = cinderSnapshotQuotaImpacts(
      [
        metric("snapshots", 1, 10),
        metric("gigabytes", 100, 500, 0, "GiB"),
        metric("snapshots_fast", 1, 4),
        metric("gigabytes_fast", 480, 500, 0, "GiB"),
      ],
      "fast",
    );

    expect(impacts.map(({ metric: item }) => item.id)).toEqual([
      "snapshots",
      "snapshots_fast",
    ]);
    expect(impacts.every(({ exceeds }) => !exceeds)).toBe(true);
  });
});
