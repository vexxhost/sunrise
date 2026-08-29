import { describe, expect, it } from "vitest";
import {
  buildGlobalSearchResources,
  excludeKnownGlobalSearchResources,
  globalSearchResourceDescription,
  resourcePreferenceToSearchResource,
} from "@/lib/global-search";

describe("global search resources", () => {
  it("normalizes searchable resources from supported services", () => {
    expect(
      buildGlobalSearchResources([
        {
          kind: "instance",
          items: [{ id: "server-1", name: "api", status: "ACTIVE" }],
        },
        {
          kind: "volume",
          items: [{ id: "volume-1", name: "database", status: "in-use" }],
        },
        {
          kind: "image",
          items: [{ id: "image-1", name: null, status: "active" }],
        },
        {
          kind: "bucket",
          items: [{ name: "artifacts" }],
        },
      ]),
    ).toEqual([
      {
        kind: "instance",
        id: "server-1",
        name: "api",
        href: "/compute/instances/server-1/overview",
        status: "ACTIVE",
      },
      {
        kind: "bucket",
        id: "artifacts",
        name: "artifacts",
        href: "/object-storage/buckets/artifacts",
        status: undefined,
      },
      {
        kind: "volume",
        id: "volume-1",
        name: "database",
        href: "/compute/volumes/volume-1",
        status: "in-use",
      },
      {
        kind: "image",
        id: "image-1",
        name: "image-1",
        href: "/compute/images/image-1",
        status: "active",
      },
    ]);
  });

  it("ignores malformed records and applies the per-source limit", () => {
    expect(
      buildGlobalSearchResources(
        [
          {
            kind: "instance",
            items: [
              { id: "first", name: "First" },
              { id: "second", name: "Second" },
            ],
          },
          { kind: "volume", items: [{ name: "missing-id" }, null] },
        ],
        1,
      ),
    ).toEqual([
      {
        kind: "instance",
        id: "first",
        name: "First",
        href: "/compute/instances/first/overview",
        status: undefined,
      },
    ]);
  });

  it("keeps pinned and recent resources out of the fetched resource group", () => {
    const resources = buildGlobalSearchResources([
      {
        kind: "instance",
        items: [
          { id: "known", name: "Known" },
          { id: "new", name: "New" },
        ],
      },
    ]);

    expect(
      excludeKnownGlobalSearchResources(resources, [
        { kind: "instance", id: "known" },
      ]),
    ).toEqual([expect.objectContaining({ kind: "instance", id: "new" })]);
  });

  it("creates searchable preference metadata without losing its route", () => {
    const resource = resourcePreferenceToSearchResource({
      kind: "cluster",
      id: "cluster-id",
      name: "production",
    });

    expect(resource.href).toBe("/kubernetes/clusters/cluster-id/overview");
    expect(globalSearchResourceDescription(resource)).toBe(
      "Kubernetes cluster · cluster-id",
    );
  });
});
