import { describe, expect, it } from "vitest";

import { collectTransitionUpdates } from "@/lib/openstack/transition-poll";

describe("transition polling", () => {
  it("collects successful resources by ID", () => {
    const resource = { id: "resource-a", status: "creating" };
    const result = collectTransitionUpdates([
      { data: resource, isError: false },
    ]);

    expect(result.hasErrors).toBe(false);
    expect(result.updates.get(resource.id)).toBe(resource);
  });

  it("reports failed detail polls so the authoritative list can refresh", () => {
    const result = collectTransitionUpdates([
      { data: undefined, isError: true },
    ]);

    expect(result.hasErrors).toBe(true);
    expect(result.updates.size).toBe(0);
  });
});
