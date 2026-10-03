import { describe, expect, it } from "vitest";
import { quickAccessForDestinations } from "@/components/overview/OverviewDashboard";
import { buildNavigationDestinations } from "@/lib/navigation-destinations";
import { parseServicePolicy } from "@/lib/service-policy";

const catalog = [
  {
    name: "nova",
    type: "compute",
    endpoints: [
      {
        id: "nova-public",
        interface: "public",
        region: "RegionOne",
        url: "https://nova.example/v2.1",
      },
    ],
  },
  {
    name: "glance",
    type: "image",
    endpoints: [
      {
        id: "glance-public",
        interface: "public",
        region: "RegionOne",
        url: "https://glance.example",
      },
    ],
  },
  {
    name: "cinderv3",
    type: "volumev3",
    endpoints: [
      {
        id: "cinder-public",
        interface: "public",
        region: "RegionOne",
        url: "https://cinder.example/v3/project",
      },
    ],
  },
  {
    name: "s3",
    type: "object-storage-s3",
    endpoints: [
      {
        id: "s3-public",
        interface: "public",
        region: "RegionOne",
        url: "https://s3.example",
      },
    ],
  },
];

describe("overview quick access", () => {
  it("follows destination-level service policy", () => {
    const destinations = buildNavigationDestinations(
      catalog,
      "RegionOne",
      parseServicePolicy({
        disabledServices: "image,volume",
        objectStorageBackends: "swift,s3",
      }),
    );

    expect(
      quickAccessForDestinations(destinations).map(({ label }) => label),
    ).toEqual(["Instances", "Buckets"]);
  });

  it("does not expose S3-only shortcuts when Swift is selected", () => {
    const destinations = buildNavigationDestinations(
      [
        ...catalog,
        {
          name: "swift",
          type: "object-storage",
          endpoints: [
            {
              id: "swift-public",
              interface: "public",
              region: "RegionOne",
              url: "https://swift.example/v1/AUTH_project",
            },
          ],
        },
      ],
      "RegionOne",
      parseServicePolicy({ objectStorageBackends: "swift,s3" }),
    );

    expect(
      quickAccessForDestinations(destinations).map(({ label }) => label),
    ).not.toContain("Buckets");
  });
});
