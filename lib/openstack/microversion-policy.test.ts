import { describe, expect, it } from "vitest";

import {
  apiMicroversionPolicyViolation,
  apiMicroversionOverrideCount,
  configuredApiMicroversion,
  parseApiMicroversionPolicy,
} from "@/lib/openstack/microversion-policy";

describe("OpenStack API microversion policy", () => {
  it("uses regional compute ceilings before the global fallback", () => {
    const policy = parseApiMicroversionPolicy({
      SUNRISE_API_MICROVERSION_COMPUTE: "2.95",
      SUNRISE_API_MICROVERSION_COMPUTE_REGION_ONE: "2.90",
    });

    expect(configuredApiMicroversion(policy, "compute", "Region-One")).toBe(
      "2.90",
    );
    expect(configuredApiMicroversion(policy, "compute", "RegionTwo")).toBe(
      "2.95",
    );
    expect(apiMicroversionOverrideCount(policy)).toBe(2);
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
        SUNRISE_API_MICROVERSION_VOLUME: "3.67",
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
});
