import { describe, expect, it } from "vitest";
import type { OpenStackCatalogService } from "@/lib/openstack/catalog";
import { buildServiceDirectory } from "@/lib/openstack/service-directory";

const endpoint = (region: string, url: string) => ({
  interface: "public",
  region,
  url,
});

const catalog: OpenStackCatalogService[] = [
  {
    name: "nova",
    type: "compute",
    endpoints: [endpoint("RegionOne", "https://nova.example.test")],
  },
  {
    name: "magnum",
    type: "container-infrastructure-management",
    endpoints: [endpoint("RegionOne", "https://magnum.example.test")],
  },
  {
    name: "s3",
    type: "object-storage-s3",
    endpoints: [endpoint("RegionOne", "https://s3.example.test")],
  },
  {
    name: "heat",
    type: "orchestration",
    endpoints: [endpoint("RegionTwo", "https://heat.example.test")],
  },
  {
    name: "manilav2",
    type: "sharev2",
    endpoints: [endpoint("RegionOne", "https://manila.example.test")],
  },
];

describe("service directory", () => {
  it("derives service availability from the active region catalog", () => {
    expect(
      buildServiceDirectory(catalog, "RegionOne").map(
        ({ id, status }) => ({ id, status }),
      ),
    ).toEqual([
      { id: "compute", status: "available" },
      { id: "kubernetes", status: "available" },
      { id: "object-storage", status: "available" },
      { id: "orchestration", status: "unavailable" },
      { id: "dns", status: "unavailable" },
      { id: "file-system", status: "available" },
    ]);
  });

  it("does not treat an endpoint in another region as available", () => {
    const orchestration = buildServiceDirectory(catalog, "RegionOne").find(
      ({ id }) => id === "orchestration",
    );

    expect(orchestration).toMatchObject({
      status: "unavailable",
      message: "Unavailable in RegionOne",
    });
  });

  it("keeps navigation available when catalog status is unknown", () => {
    expect(buildServiceDirectory(null, "RegionOne")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "compute",
          status: "unknown",
          message: "Catalog availability could not be verified",
        }),
      ]),
    );
  });
});
