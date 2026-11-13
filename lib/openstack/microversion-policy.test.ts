import { describe, expect, it } from "vitest";

import {
  apiMicroversionPolicyViolation,
  apiMicroversionOverrideCount,
  configuredApiMicroversion,
  parseApiMicroversionPolicy,
} from "@/lib/openstack/microversion-policy";

describe("OpenStack API microversion policy", () => {
  it("uses regional service ceilings before the global fallback", () => {
    const policy = parseApiMicroversionPolicy({
      SUNRISE_API_MICROVERSION_COMPUTE: "2.95",
      SUNRISE_API_MICROVERSION_COMPUTE_REGION_ONE: "2.90",
      SUNRISE_API_MICROVERSION_VOLUME: "3.71",
      SUNRISE_API_MICROVERSION_VOLUME_REGION_ONE: "3.66",
    });

    expect(configuredApiMicroversion(policy, "compute", "Region-One")).toBe(
      "2.90",
    );
    expect(configuredApiMicroversion(policy, "compute", "RegionTwo")).toBe(
      "2.95",
    );
    expect(configuredApiMicroversion(policy, "volume", "Region-One")).toBe(
      "3.66",
    );
    expect(configuredApiMicroversion(policy, "volume", "RegionTwo")).toBe(
      "3.71",
    );
    expect(apiMicroversionOverrideCount(policy)).toBe(4);
  });

  it("treats blank values as unconfigured", () => {
    const policy = parseApiMicroversionPolicy({
      SUNRISE_API_MICROVERSION_COMPUTE: "",
      SUNRISE_API_MICROVERSION_COMPUTE_REGIONONE: "  ",
    });

    expect(configuredApiMicroversion(policy, "compute", "RegionOne")).toBe(
      undefined,
    );
    expect(apiMicroversionOverrideCount(policy)).toBe(0);
  });

  it("rejects malformed, obsolete, and unknown settings", () => {
    expect(() =>
      parseApiMicroversionPolicy({
        SUNRISE_API_MICROVERSION_COMPUTE: "latest",
      }),
    ).toThrow("must use major.minor numeric syntax");
    expect(() =>
      parseApiMicroversionPolicy({
        SUNRISE_API_MICROVERSION_COMPUTE: "2.78",
      }),
    ).toThrow("must be 2.79 or newer");
    expect(() =>
      parseApiMicroversionPolicy({
        SUNRISE_API_MICROVERSION_VOLUME: "2.99",
      }),
    ).toThrow("must be 3.0 or newer");
    expect(() =>
      parseApiMicroversionPolicy({
        SUNRISE_API_MICROVERSION_IMAGE: "2.19",
      }),
    ).toThrow("is not a supported API microversion setting");
  });

  it("rejects requests above the effective regional ceiling", () => {
    const policy = parseApiMicroversionPolicy({
      SUNRISE_API_MICROVERSION_COMPUTE: "2.95",
      SUNRISE_API_MICROVERSION_COMPUTE_REGIONONE: "2.90",
    });

    expect(
      apiMicroversionPolicyViolation(
        policy,
        "compute",
        "RegionOne",
        "compute 2.91",
      ),
    ).toContain("exceeds the configured maximum 2.90");
    expect(
      apiMicroversionPolicyViolation(
        policy,
        "compute",
        "RegionOne",
        "compute 2.90",
      ),
    ).toBeUndefined();
    expect(
      apiMicroversionPolicyViolation(
        policy,
        "compute",
        "RegionOne",
        "compute latest",
      ),
    ).toContain("explicit numeric microversion");
    expect(
      apiMicroversionPolicyViolation(policy, "network", "RegionOne", undefined),
    ).toBeUndefined();
  });

  it("enforces volume ceilings for Cinder service type aliases", () => {
    const policy = parseApiMicroversionPolicy({
      SUNRISE_API_MICROVERSION_VOLUME_REGIONONE: "3.65",
    });

    expect(
      apiMicroversionPolicyViolation(
        policy,
        "volumev3",
        "RegionOne",
        "volume 3.66",
      ),
    ).toContain("exceeds the configured maximum 3.65");
    expect(
      apiMicroversionPolicyViolation(
        policy,
        "volumev3",
        "RegionOne",
        "volume 3.65",
      ),
    ).toBeUndefined();
    expect(
      apiMicroversionPolicyViolation(
        policy,
        "volumev3",
        "RegionOne",
        "volumev3 3.65",
      ),
    ).toContain("explicit numeric microversion");
  });
});
