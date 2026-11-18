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
      SUNRISE_API_MICROVERSION_CONTAINER_INFRA: "1.14",
      SUNRISE_API_MICROVERSION_CONTAINER_INFRA_REGION_ONE: "1.13",
      SUNRISE_API_MICROVERSION_LOAD_BALANCER: "2.20",
      SUNRISE_API_MICROVERSION_LOAD_BALANCER_REGION_ONE: "2.14",
      SUNRISE_API_MICROVERSION_SHARE: "2.70",
      SUNRISE_API_MICROVERSION_SHARE_REGION_ONE: "2.63",
      SUNRISE_API_MICROVERSION_VOLUME: "3.71",
      SUNRISE_API_MICROVERSION_VOLUME_REGION_ONE: "3.66",
    });

    expect(configuredApiMicroversion(policy, "compute", "Region-One")).toBe(
      "2.90",
    );
    expect(configuredApiMicroversion(policy, "compute", "RegionTwo")).toBe(
      "2.95",
    );
    expect(
      configuredApiMicroversion(policy, "container-infra", "Region-One"),
    ).toBe("1.13");
    expect(
      configuredApiMicroversion(policy, "container-infra", "RegionTwo"),
    ).toBe("1.14");
    expect(configuredApiMicroversion(policy, "volume", "Region-One")).toBe(
      "3.66",
    );
    expect(
      configuredApiMicroversion(policy, "load-balancer", "Region-One"),
    ).toBe("2.14");
    expect(
      configuredApiMicroversion(policy, "load-balancer", "RegionTwo"),
    ).toBe("2.20");
    expect(configuredApiMicroversion(policy, "volume", "RegionTwo")).toBe(
      "3.71",
    );
    expect(configuredApiMicroversion(policy, "share", "Region-One")).toBe(
      "2.63",
    );
    expect(configuredApiMicroversion(policy, "share", "RegionTwo")).toBe(
      "2.70",
    );
    expect(apiMicroversionOverrideCount(policy)).toBe(10);
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
        SUNRISE_API_MICROVERSION_CONTAINER_INFRA: "1.11",
      }),
    ).toThrow("must be 1.12 or newer");
    expect(() =>
      parseApiMicroversionPolicy({
        SUNRISE_API_MICROVERSION_SHARE: "2.50",
      }),
    ).toThrow("must be 2.51 or newer");
    expect(() =>
      parseApiMicroversionPolicy({
        SUNRISE_API_MICROVERSION_LOAD_BALANCER: "1.9",
      }),
    ).toThrow("must be 2.0 or newer");
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

  it("enforces Load Balancing ceilings with the Octavia header identity", () => {
    const policy = parseApiMicroversionPolicy({
      SUNRISE_API_MICROVERSION_LOAD_BALANCER_REGIONONE: "2.14",
    });

    expect(
      apiMicroversionPolicyViolation(
        policy,
        "load-balancer",
        "RegionOne",
        "load-balancer 2.15",
      ),
    ).toContain("exceeds the configured maximum 2.14");
    expect(
      apiMicroversionPolicyViolation(
        policy,
        "load-balancer",
        "RegionOne",
        "load-balancer 2.14",
      ),
    ).toBeUndefined();
    expect(
      apiMicroversionPolicyViolation(
        policy,
        "load-balancer",
        "RegionOne",
        "octavia 2.14",
      ),
    ).toContain("explicit numeric microversion");
  });

  it("enforces Magnum ceilings for Container Infrastructure aliases", () => {
    const policy = parseApiMicroversionPolicy({
      SUNRISE_API_MICROVERSION_CONTAINER_INFRA_REGIONONE: "1.13",
    });

    for (const serviceType of [
      "container-infra",
      "container-infrastructure",
      "container-infrastructure-management",
    ]) {
      expect(
        apiMicroversionPolicyViolation(
          policy,
          serviceType,
          "RegionOne",
          "container-infra 1.14",
        ),
      ).toContain("exceeds the configured maximum 1.13");
      expect(
        apiMicroversionPolicyViolation(
          policy,
          serviceType,
          "RegionOne",
          "container-infra 1.13",
        ),
      ).toBeUndefined();
    }
  });

  it("enforces bare Manila microversions for share service type aliases", () => {
    const policy = parseApiMicroversionPolicy({
      SUNRISE_API_MICROVERSION_SHARE_REGIONONE: "2.69",
    });

    expect(
      apiMicroversionPolicyViolation(policy, "sharev2", "RegionOne", "2.70"),
    ).toContain("exceeds the configured maximum 2.69");
    expect(
      apiMicroversionPolicyViolation(policy, "sharev2", "RegionOne", "2.69"),
    ).toBeUndefined();
    expect(
      apiMicroversionPolicyViolation(
        policy,
        "sharev2",
        "RegionOne",
        "share 2.69",
      ),
    ).toContain("explicit numeric microversion");
  });
});
