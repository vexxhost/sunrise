import { describe, expect, it } from "vitest";
import {
  RESOURCE_PREFERENCE_LIMIT,
  addRecentResource,
  createResourcePreference,
  parseResourcePreferences,
  resourcePreferenceHref,
  serializeResourcePreferences,
  togglePinnedResource,
  visibleResourcePreferences,
  type ResourcePreference,
  type ResourceKind,
} from "@/lib/resource-preferences";

const context = {
  projectId: "7a96a68d-c826-4f3d-84fa-fd95a72265c5",
  regionId: "RegionOne",
};

function resource(
  id: string,
  updatedAt: number,
  kind: ResourceKind = "instance",
): ResourcePreference {
  const result = createResourcePreference(
    { kind, id, name: `Resource ${id}` },
    context,
    updatedAt,
  );
  if (!result) throw new Error("Test resource should be valid");
  return result;
}

describe("resource preferences", () => {
  it("validates, normalizes, sorts, deduplicates, and bounds cookie data", () => {
    const parsed = parseResourcePreferences([
      resource("old", 1),
      resource("new", 3),
      resource("old", 2),
      { kind: "server", id: "invalid", name: "Invalid" },
      null,
    ]);

    expect(parsed.map(({ id }) => id)).toEqual(["new", "old"]);
    expect(parsed[1].updatedAt).toBe(2);
    expect(parsed[0].projectId).toBe("7a96a68dc8264f3d84fafd95a72265c5");

    const bounded = parseResourcePreferences(
      Array.from({ length: RESOURCE_PREFERENCE_LIMIT + 3 }, (_, index) =>
        resource(String(index), index + 1),
      ),
    );
    expect(bounded).toHaveLength(RESOURCE_PREFERENCE_LIMIT);
    expect(bounded.map(({ id }) => id)).toEqual(["6", "5", "4", "3"]);
  });

  it("moves a revisited resource to the front without duplicating it", () => {
    const current = [resource("one", 1), resource("two", 2)];
    const next = addRecentResource(current, resource("one", 3));

    expect(next.map(({ id, updatedAt }) => ({ id, updatedAt }))).toEqual([
      { id: "one", updatedAt: 3 },
      { id: "two", updatedAt: 2 },
    ]);
  });

  it("toggles pins and hides pinned resources from the recent list", () => {
    const one = resource("one", 3);
    const two = resource("two", 2);
    const added = togglePinnedResource([], one);

    expect(added.pinned).toBe(true);
    expect(
      visibleResourcePreferences({
        recent: [one, two],
        pinned: added.resources,
        context,
      }),
    ).toEqual({ pinned: [one], recent: [two] });

    const removed = togglePinnedResource(added.resources, one);
    expect(removed).toEqual({ pinned: false, resources: [] });
  });

  it("keeps resources isolated by project and region", () => {
    const current = resource("current", 3);
    const otherProject = {
      ...resource("other-project", 2),
      projectId: "37c05c43a57d419097dce9eee2769027",
    };
    const otherRegion = {
      ...resource("other-region", 1),
      regionId: "RegionTwo",
    };

    expect(
      visibleResourcePreferences({
        recent: [current, otherProject, otherRegion],
        pinned: [],
        context,
      }).recent,
    ).toEqual([current]);
  });

  it("derives supported detail routes instead of accepting stored URLs", () => {
    expect(resourcePreferenceHref(resource("server id", 1))).toBe(
      "/compute/instances/server%20id/overview",
    );
    expect(resourcePreferenceHref(resource("bucket/name", 1, "bucket"))).toBe(
      "/object-storage/buckets/bucket%2Fname",
    );
  });

  it("round-trips compact cookie tuples", () => {
    const resources = [resource("one", 2), resource("two", 1, "bucket")];
    const serialized = serializeResourcePreferences(resources);

    expect(Array.isArray(serialized[0])).toBe(true);
    expect(parseResourcePreferences(serialized)).toEqual(resources);
  });
});
