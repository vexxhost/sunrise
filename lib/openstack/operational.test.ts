import { describe, expect, it } from "vitest";
import {
  compileOperationalFeed,
  type OperationalFeed,
} from "@/lib/openstack/operational";
import type { OverviewService } from "@/lib/openstack/overview";

const services: OverviewService[] = [
  {
    id: "compute",
    label: "Compute",
    href: "/compute/instances",
    status: "available",
    metrics: [
      {
        id: "instances",
        label: "Instances",
        used: 9,
        reserved: 0,
        limit: 10,
        level: "critical",
        href: "/compute/instances",
      },
    ],
  },
  {
    id: "network",
    label: "Network",
    href: "/compute/networks",
    status: "error",
    metrics: [],
    message: "Temporarily unreachable",
  },
];

const resourceFeed: OperationalFeed = {
  signals: [
    {
      id: "image:image-id",
      severity: "critical",
      category: "resource",
      service: "Images",
      title: "Image upload failed",
      detail: "The image entered the killed state.",
      href: "/compute/images/image-id",
      timestamp: "2026-08-29T12:00:00Z",
      timestampKind: "occurred",
    },
  ],
  sources: [
    {
      id: "compute",
      label: "Compute",
      href: "/compute/instances",
      status: "available",
    },
    {
      id: "kubernetes",
      label: "Kubernetes",
      href: "/kubernetes/clusters",
      status: "error",
      message: "Temporarily unreachable",
    },
  ],
};

describe("operational signal compilation", () => {
  it("combines resources, quota pressure, service failures, and expiring credentials", () => {
    const now = Date.parse("2026-08-29T12:05:00Z");
    const result = compileOperationalFeed({
      services,
      resourceFeed,
      credentialExpiration: now + 10 * 60 * 1000,
      now,
    });

    expect(result.signals.map((signal) => signal.id)).toEqual([
      "image:image-id",
      "quota:compute:instances",
      "credential:object-storage",
      "monitor:kubernetes",
      "service:network",
    ]);
    expect(result.signals[1]).toMatchObject({
      severity: "critical",
      title: "Instances quota is at 90%",
    });
    expect(result.signals[2]).toMatchObject({
      severity: "warning",
      timestampKind: "expires",
    });
  });

  it("does not flag healthy services or fresh credentials", () => {
    const now = Date.parse("2026-08-29T12:05:00Z");
    const result = compileOperationalFeed({
      services: [
        {
          ...services[0],
          metrics: [{ ...services[0].metrics[0], level: "normal", used: 1 }],
        },
      ],
      resourceFeed: { signals: [], sources: [resourceFeed.sources[0]] },
      credentialExpiration: now + 30 * 60 * 1000,
      now,
    });

    expect(result.signals).toEqual([]);
  });

  it("marks expired credentials as critical", () => {
    const now = Date.parse("2026-08-29T12:05:00Z");
    const result = compileOperationalFeed({
      services: [],
      resourceFeed: { signals: [], sources: [] },
      credentialExpiration: now - 1,
      now,
    });

    expect(result.signals[0]).toMatchObject({
      id: "credential:object-storage",
      severity: "critical",
      title: "Object storage credentials expired",
    });
  });
});
