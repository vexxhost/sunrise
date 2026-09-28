import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  hasFreshCloudContextBootstrap,
  stashCloudContextBootstrap,
  takeCloudContextBootstrap,
  type CloudContextBootstrap,
} from "@/lib/cloud-context-bootstrap";

const bootstrap: CloudContextBootstrap = {
  projects: [
    {
      id: "project-1",
      name: "Project One",
      domain_id: "default",
      description: "",
      enabled: true,
      parent_id: "",
      is_domain: false,
      tags: [],
      options: {},
      links: { self: "https://identity.example.test/v3/projects/project-1" },
    },
  ],
  regions: [
    {
      id: "RegionOne",
      links: { self: "https://identity.example.test/v3/regions/RegionOne" },
    },
  ],
  catalog: [],
  userName: "Sunrise Operator",
};

describe("cloud context login bootstrap", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hands discovery results to the first overview request once", () => {
    const id = stashCloudContextBootstrap(bootstrap);

    expect(hasFreshCloudContextBootstrap(id)).toBe(true);
    expect(takeCloudContextBootstrap(id)).toEqual(bootstrap);
    expect(hasFreshCloudContextBootstrap(id)).toBe(true);
    expect(takeCloudContextBootstrap(id)).toBeUndefined();
  });

  it("expires abandoned login handoffs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    const id = stashCloudContextBootstrap(bootstrap);

    vi.advanceTimersByTime(30_001);

    expect(hasFreshCloudContextBootstrap(id)).toBe(false);
    expect(takeCloudContextBootstrap(id)).toBeUndefined();
  });
});
