import { describe, expect, it } from "vitest";
import {
  isObjectStorageBackendEnabled,
  isServiceEnabled,
  isSunriseServiceEnabled,
  parseServicePolicy,
} from "@/lib/service-policy";

describe("service policy", () => {
  it("uses Swift by default", () => {
    expect(parseServicePolicy()).toEqual({
      disabledServices: [],
      disabledServicesByRegion: {},
      objectStorageBackends: ["swift"],
    });
  });

  it("supports global and region-specific service disablement", () => {
    const policy = parseServicePolicy({
      disabledServices: "dns",
      disabledServicesByRegion: {
        REGIONTWO: "container-infra",
      },
      objectStorageBackends: "swift,s3,swift",
    });

    expect(isServiceEnabled(policy, "dns", "RegionOne")).toBe(false);
    expect(isSunriseServiceEnabled(policy, "object-storage", "RegionOne")).toBe(
      true,
    );
    expect(isServiceEnabled(policy, "container-infra", "RegionTwo")).toBe(
      false,
    );
    expect(policy.objectStorageBackends).toEqual(["swift", "s3"]);
  });

  it("supports disabling individual Object Storage backends by region", () => {
    const policy = parseServicePolicy({
      disabledServicesByRegion: {
        REGIONONE: "object-storage-s3,dns",
      },
      objectStorageBackends: "s3,swift",
    });

    expect(isSunriseServiceEnabled(policy, "object-storage", "RegionOne")).toBe(
      true,
    );
    expect(isObjectStorageBackendEnabled(policy, "s3", "RegionOne")).toBe(
      false,
    );
    expect(isObjectStorageBackendEnabled(policy, "swift", "RegionOne")).toBe(
      true,
    );
    expect(isObjectStorageBackendEnabled(policy, "s3", "RegionTwo")).toBe(true);
  });

  it("uses Keystone's object-storage identifier for Swift", () => {
    const policy = parseServicePolicy({
      disabledServicesByRegion: {
        REGIONONE: "object-storage",
        REGIONTWO: "object-storage,object-storage-s3",
      },
      objectStorageBackends: "s3,swift",
    });

    expect(isObjectStorageBackendEnabled(policy, "swift", "RegionOne")).toBe(
      false,
    );
    expect(isObjectStorageBackendEnabled(policy, "s3", "RegionOne")).toBe(true);
    expect(isSunriseServiceEnabled(policy, "object-storage", "RegionOne")).toBe(
      true,
    );
    expect(isSunriseServiceEnabled(policy, "object-storage", "RegionTwo")).toBe(
      false,
    );
  });

  it("uses stable versionless OpenStack service identifiers", () => {
    const policy = parseServicePolicy({
      disabledServices: "volume,share,network,container-infra",
    });

    expect(isServiceEnabled(policy, "volume", "RegionOne")).toBe(false);
    expect(isServiceEnabled(policy, "share", "RegionOne")).toBe(false);
    expect(isServiceEnabled(policy, "network", "RegionOne")).toBe(false);
    expect(isServiceEnabled(policy, "container-infra", "RegionOne")).toBe(
      false,
    );
  });

  it("normalizes region IDs and configured environment suffixes", () => {
    const policy = parseServicePolicy({
      disabledServicesByRegion: {
        region_one: "dns",
      },
    });

    expect(isServiceEnabled(policy, "dns", "Region-One")).toBe(false);
    expect(isServiceEnabled(policy, "dns", "RegionTwo")).toBe(true);
  });

  it("rejects region suffix collisions", () => {
    expect(() =>
      parseServicePolicy({
        disabledServicesByRegion: {
          "region-one": "dns",
          region_one: "image",
        },
      }),
    ).toThrow(/both map to REGION_ONE/);
  });

  it("rejects unknown service and backend names", () => {
    expect(() =>
      parseServicePolicy({ disabledServices: "object-store" }),
    ).toThrow(/unknown service/);
    expect(() => parseServicePolicy({ disabledServices: "volumev3" })).toThrow(
      /unknown service/,
    );
    expect(() => parseServicePolicy({ disabledServices: "sharev2" })).toThrow(
      /unknown service/,
    );
    expect(() => parseServicePolicy({ objectStorageBackends: "ceph" })).toThrow(
      /unknown backend/,
    );
  });
});
