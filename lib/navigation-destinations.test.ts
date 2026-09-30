import { describe, expect, it, vi } from "vitest";
import {
  buildNavigationDestinations,
  commandPaletteFilter,
  MAX_FAVORITE_DESTINATIONS,
  parseFavoriteDestinationIds,
  toggleFavoriteDestination,
} from "@/lib/navigation-destinations";

const catalog = [
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
    name: "cinderv3",
    type: "volumev3",
    endpoints: [
      {
        interface: "public",
        region: "RegionOne",
        url: "https://cinder.example.test/v3",
      },
    ],
  },
];

describe("navigation destinations", () => {
  it("resolves each page against its own service catalog entry", () => {
    const destinations = buildNavigationDestinations(catalog, "RegionOne");

    expect(
      destinations.find(({ id }) => id === "compute.instances")?.status,
    ).toBe("available");
    expect(
      destinations.find(({ id }) => id === "compute.volumes")?.status,
    ).toBe("available");
    expect(
      destinations.find(({ id }) => id === "compute.networks")?.status,
    ).toBe("unavailable");
  });

  it("keeps destinations usable when catalog availability is unknown", () => {
    expect(
      buildNavigationDestinations(null, "RegionOne").every(
        ({ status }) => status === "unknown",
      ),
    ).toBe(true);
  });

  it("accepts only known, unique, bounded favorite IDs", () => {
    const many = Array.from(
      { length: MAX_FAVORITE_DESTINATIONS + 5 },
      (_, index) => (index % 2 ? "compute.volumes" : "compute.instances"),
    );

    expect(
      parseFavoriteDestinationIds([
        "compute.instances",
        "unknown.destination",
        "compute.instances",
        "compute.volumes",
      ]),
    ).toEqual(["compute.instances", "compute.volumes"]);
    expect(parseFavoriteDestinationIds(many)).toHaveLength(2);
  });

  it("adds the newest favorite first and toggles existing favorites off", () => {
    expect(
      toggleFavoriteDestination(["compute.instances"], "compute.volumes"),
    ).toEqual(["compute.volumes", "compute.instances"]);
    expect(
      toggleFavoriteDestination(
        ["compute.volumes", "compute.instances"],
        "compute.volumes",
      ),
    ).toEqual(["compute.instances"]);
  });

  it("matches complete search tokens without unrelated fuzzy results", () => {
    expect(
      commandPaletteFilter(
        "Volumes Persistent block-storage disks cinder ebs",
        "disk",
      ),
    ).toBeGreaterThan(0);
    expect(
      commandPaletteFilter(
        "Create cluster template Define reusable Kubernetes defaults",
        "disk",
      ),
    ).toBe(0);
    expect(
      commandPaletteFilter(
        "Instances Virtual machines nova ec2 vm",
        "virtual vm",
      ),
    ).toBeGreaterThan(0);
  });

  it("uses locale-independent case folding", () => {
    const localeLowerCase = vi
      .spyOn(String.prototype, "toLocaleLowerCase")
      .mockImplementation(function (this: string) {
        return this.replaceAll("I", "ı").toLowerCase();
      });

    try {
      expect(commandPaletteFilter("Instances Active", "instances active"))
        .toBeGreaterThan(0);
      expect(localeLowerCase).not.toHaveBeenCalled();
    } finally {
      localeLowerCase.mockRestore();
    }
  });
});
