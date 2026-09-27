import { describe, expect, it } from "vitest";
import {
  buildCreateActions,
  createActionIntentClearedHref,
  createActionsForService,
  isCreateActionRequested,
} from "@/lib/create-actions";
import type { OpenStackCatalogService } from "@/lib/openstack/catalog";

const catalog: OpenStackCatalogService[] = [
  {
    name: "nova",
    type: "compute",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://nova.example.test",
      },
    ],
  },
  {
    name: "s3",
    type: "object-storage-s3",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://rgw.example.test",
      },
    ],
  },
];

function build(
  overrides: Partial<Parameters<typeof buildCreateActions>[0]> = {},
) {
  return buildCreateActions({
    catalog,
    catalogStatus: "available",
    objectStorageRole: { status: "active", message: "Using ProjectRole" },
    projectId: "project-a",
    regionId: "RegionOne",
    ...overrides,
  });
}

describe("create action availability", () => {
  it("uses the exact backing service instead of the landing-page service", () => {
    const actions = build();

    expect(actions.find(({ id }) => id === "instance")?.capability.status).toBe(
      "available",
    );
    expect(actions.find(({ id }) => id === "volume")?.capability.status).toBe(
      "unavailable",
    );
    expect(actions.find(({ id }) => id === "network")?.capability.status).toBe(
      "unavailable",
    );
  });

  it("requires active RGW credentials before offering bucket creation", () => {
    const bucket = build({
      objectStorageRole: {
        status: "authentication-required",
        message: "Sign in to Object Storage",
      },
    }).find(({ id }) => id === "bucket");

    expect(bucket?.capability).toEqual({
      status: "unavailable",
      permission: "unknown",
      message: "Sign in to Object Storage",
    });
  });

  it("keeps permissions unknown until the service handles the mutation", () => {
    const instance = build().find(({ id }) => id === "instance");

    expect(instance?.capability).toMatchObject({
      status: "available",
      permission: "unknown",
    });
    expect(instance?.capability.message).toContain("verified when you submit");
  });

  it("disables every action without an active project", () => {
    expect(
      build({ projectId: null }).every(
        ({ capability }) => capability.status === "unavailable",
      ),
    ).toBe(true);
  });

  it("recomputes service availability for the active region", () => {
    const actions = build({ regionId: "RegionTwo" });

    expect(
      actions.every(({ capability }) => capability.status === "unavailable"),
    ).toBe(true);
    expect(actions[0]?.capability.message).toContain("RegionTwo");
  });

  it("does not advertise create flows that have no implemented CRUD", () => {
    expect(build().map(({ id }) => id)).not.toContain("role");
    expect(build().map(({ id }) => id)).not.toContain("share");
    expect(build().map(({ id }) => id)).not.toContain("load-balancer");
  });

  it("filters service actions and validates URL intents", () => {
    expect(createActionsForService(build(), "object-storage")).toHaveLength(1);
    expect(isCreateActionRequested("instance", "instance")).toBe(true);
    expect(isCreateActionRequested(["volume", "instance"], "volume")).toBe(
      true,
    );
    expect(isCreateActionRequested(undefined, "instance")).toBe(false);
  });

  it("removes only the create action intent from a route", () => {
    expect(
      createActionIntentClearedHref(
        "https://sunrise.example/compute/instances?create=instance&filter=active#servers",
      ),
    ).toBe("/compute/instances?filter=active#servers");
    expect(
      createActionIntentClearedHref(
        "/compute/instances?filter=active#servers",
      ),
    ).toBeNull();
  });
});
