import { describe, expect, it } from "vitest";
import {
  isObjectStorageBackendEnabled,
  isServiceEnabled,
  isSunriseServiceEnabled,
  parseServicePolicy,
} from "@/lib/service-policy";

describe("service policy", () => {
  it("preserves the current S3-first behavior by default", () => {
    expect(parseServicePolicy()).toEqual({
      disabledServices: [],
      disabledServicesByRegion: {},
      objectStorageBackends: ["s3"],
    });
  });

  it("supports global and region-specific service disablement", () => {
    const policy = parseServicePolicy({
      disabledServices: "dns",
      disabledServicesByRegion: JSON.stringify({
        RegionTwo: ["container-infra"],
      }),
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
      disabledServicesByRegion: JSON.stringify({
        RegionOne: ["object-storage-s3", "dns"],
      }),
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
      disabledServicesByRegion: JSON.stringify({
        RegionOne: ["object-storage"],
        RegionTwo: ["object-storage", "object-storage-s3"],
      }),
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
