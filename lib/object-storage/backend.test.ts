import { describe, expect, it } from "vitest";
import { resolveObjectStorageBackend } from "@/lib/object-storage/backend";
import type { OpenStackCatalogService } from "@/lib/openstack/catalog";
import { parseServicePolicy } from "@/lib/service-policy";

const catalog: OpenStackCatalogService[] = [
  {
    name: "s3",
    type: "object-storage-s3",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://s3.example.test",
      },
    ],
  },
  {
    name: "object-storage",
    type: "object-storage",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://swift.example.test/v1/AUTH_project",
      },
      {
        interface: "public",
        region: "RegionTwo",
        url: "https://swift.region-two.example.test/v1/AUTH_project",
      },
    ],
  },
];

describe("Object Storage backend resolution", () => {
  it("uses configured preference order when both backends exist", () => {
    expect(
      resolveObjectStorageBackend(
        catalog,
        "RegionOne",
        parseServicePolicy({ objectStorageBackends: "swift,s3" }),
      ),
    ).toEqual({
      backend: "swift",
      endpoint: "https://swift.example.test/v1/AUTH_project",
    });
  });

  it("falls back to the next configured backend in the active region", () => {
    expect(
      resolveObjectStorageBackend(
        catalog,
        "RegionTwo",
        parseServicePolicy({ objectStorageBackends: "s3,swift" }),
      ),
    ).toEqual({
      backend: "swift",
      endpoint: "https://swift.region-two.example.test/v1/AUTH_project",
    });
  });

  it("falls back when the preferred backend is disabled in the region", () => {
    expect(
      resolveObjectStorageBackend(
        catalog,
        "RegionOne",
        parseServicePolicy({
          disabledServicesByRegion: {
            REGIONONE: "object-storage-s3",
          },
          objectStorageBackends: "s3,swift",
        }),
      ),
    ).toEqual({
      backend: "swift",
      endpoint: "https://swift.example.test/v1/AUTH_project",
    });
  });

  it("does not use an endpoint from another region", () => {
    expect(
      resolveObjectStorageBackend(
        catalog,
        "RegionTwo",
        parseServicePolicy({ objectStorageBackends: "s3" }),
      ),
    ).toBeNull();
  });
});
