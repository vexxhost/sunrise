import { describe, expect, it } from "vitest";

import {
  compareMicroversions,
  extensionSupport,
  microversionSupport,
  parseExtensionAliases,
  parseMicroversionDiscovery,
  parseMicroversionRange,
  preferredMicroversionSupport,
  type OpenStackServiceCapabilities,
} from "@/lib/openstack/capabilities";

describe("OpenStack capability evaluation", () => {
  it("parses Nova version detail and version collection responses", () => {
    expect(
      parseMicroversionRange({
        version: {
          id: "v2.1",
          min_version: "2.1",
          status: "CURRENT",
          version: "2.100",
        },
      }),
    ).toEqual({ minimum: "2.1", maximum: "2.100" });

    expect(
      parseMicroversionDiscovery({
        version: {
          id: "v2.0",
          min_version: "",
          status: "SUPPORTED",
          version: "",
        },
      }),
    ).toEqual({ microversions: null });
    expect(parseMicroversionDiscovery({ version: {} })).toBeNull();
    expect(
      parseMicroversionDiscovery({
        version: {
          id: "v2.1",
          min_version: "not-a-version",
          status: "CURRENT",
          version: "2.100",
        },
      }),
    ).toBeNull();

    expect(
      parseMicroversionRange({
        versions: [
          {
            id: "v2.0",
            min_version: "",
            status: "DEPRECATED",
            version: "",
          },
          {
            id: "v2.1",
            min_version: "2.1",
            status: "CURRENT",
            version: "2.85",
          },
        ],
      }),
    ).toEqual({ minimum: "2.1", maximum: "2.85" });

    expect(
      parseMicroversionRange({
        versions: [
          {
            min_version: "2.1",
            status: "SUPPORTED",
            version: "2.90",
          },
          {
            min_version: "2.1",
            status: "CURRENT",
            version: "2.100",
          },
        ],
      }),
    ).toEqual({ minimum: "2.1", maximum: "2.100" });

    expect(
      parseMicroversionDiscovery({
        versions: [
          {
            id: "v2.0",
            min_version: "",
            status: "SUPPORTED",
            version: "",
          },
          {
            id: "v2.1",
            min_version: "invalid",
            status: "CURRENT",
            version: "2.100",
          },
        ],
      }),
    ).toBeNull();
  });

  it("compares numeric microversions without lexical ordering errors", () => {
    expect(compareMicroversions("2.9", "2.85")).toBeLessThan(0);
    expect(compareMicroversions("2.100", "2.85")).toBeGreaterThan(0);
    expect(compareMicroversions("2.85", "2.85")).toBe(0);
  });

  it("reports supported, unsupported, and unknown microversion features", () => {
    const available: OpenStackServiceCapabilities = {
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "2.1", maximum: "2.84" },
      serviceType: "compute",
    };

    expect(
      microversionSupport(available, "2.79", "Attachment metadata"),
    ).toMatchObject({
      status: "supported",
      requestedMicroversion: "2.79",
    });
    expect(
      microversionSupport(available, "2.85", "Delete with instance"),
    ).toMatchObject({
      status: "unsupported",
      message: expect.stringContaining("2.1 through 2.84"),
    });
    expect(
      microversionSupport(
        {
          discoveryStatus: "unavailable",
          message: "",
          serviceType: "compute",
        },
        "2.85",
        "Delete with instance",
      ),
    ).toMatchObject({ status: "unknown" });

    expect(
      microversionSupport(
        {
          discoveryStatus: "available",
          message: "",
          serviceType: "network",
        },
        "2.85",
        "Delete with instance",
      ),
    ).toMatchObject({ status: "unknown" });

    expect(
      microversionSupport(
        {
          discoveryStatus: "available",
          message: "",
          microversions: null,
          serviceType: "compute",
        },
        "2.85",
        "Delete with instance",
      ),
    ).toMatchObject({
      status: "unsupported",
      message: expect.stringContaining("does not advertise"),
    });

    expect(
      microversionSupport(
        {
          discoveryStatus: "available",
          message: "",
          microversions: { minimum: "2.90", maximum: "2.100" },
          serviceType: "compute",
        },
        "2.85",
        "Delete with instance",
      ),
    ).toMatchObject({
      status: "supported",
      requestedMicroversion: "2.90",
    });

    expect(
      microversionSupport(
        {
          configuredMicroversionMaximum: "2.84",
          discoveryStatus: "available",
          message: "",
          microversions: { minimum: "2.1", maximum: "2.100" },
          serviceType: "compute",
        },
        "2.85",
        "Delete with instance",
      ),
    ).toMatchObject({
      status: "unsupported",
      message: expect.stringContaining("configured not to request newer"),
    });

    expect(
      microversionSupport(
        {
          configuredMicroversionMaximum: "2.84",
          discoveryStatus: "unavailable",
          message: "",
          serviceType: "compute",
        },
        "2.85",
        "Delete with instance",
      ),
    ).toMatchObject({
      status: "unsupported",
      message: expect.stringContaining("configured not to request newer"),
    });

    expect(
      microversionSupport(
        {
          configuredMicroversionMaximum: "2.90",
          discoveryStatus: "available",
          message: "",
          microversions: { minimum: "2.95", maximum: "2.100" },
          serviceType: "compute",
        },
        "2.85",
        "Delete with instance",
      ),
    ).toMatchObject({
      status: "unsupported",
      message: expect.stringContaining("cloud's minimum 2.95"),
    });

    expect(
      microversionSupport(
        {
          configuredMicroversionMaximum: "2.84",
          discoveryStatus: "available",
          message: "",
          microversions: { minimum: "2.1", maximum: "2.83" },
          serviceType: "compute",
        },
        "2.85",
        "Delete with instance",
      ),
    ).toMatchObject({
      status: "unsupported",
      message: expect.stringContaining("cloud advertises 2.1 through 2.83"),
    });
  });

  it("selects the richest permitted microversion for optional response fields", () => {
    const available: OpenStackServiceCapabilities = {
      discoveryStatus: "available",
      message: "",
      microversions: { minimum: "3.0", maximum: "3.71" },
      serviceType: "volume",
    };

    expect(
      preferredMicroversionSupport(
        available,
        "3.0",
        "3.65",
        "Extended volume details",
      ),
    ).toMatchObject({
      status: "supported",
      requestedMicroversion: "3.65",
    });
    expect(
      preferredMicroversionSupport(
        {
          ...available,
          microversions: { minimum: "3.0", maximum: "3.60" },
        },
        "3.0",
        "3.65",
        "Extended volume details",
      ),
    ).toMatchObject({
      status: "supported",
      requestedMicroversion: "3.60",
    });
    expect(
      preferredMicroversionSupport(
        { ...available, configuredMicroversionMaximum: "3.55" },
        "3.0",
        "3.65",
        "Extended volume details",
      ),
    ).toMatchObject({
      status: "supported",
      requestedMicroversion: "3.55",
    });
    expect(
      preferredMicroversionSupport(
        {
          ...available,
          microversions: { minimum: "3.68", maximum: "3.71" },
        },
        "3.0",
        "3.65",
        "Extended volume details",
      ),
    ).toMatchObject({
      status: "supported",
      requestedMicroversion: "3.68",
    });
    expect(
      preferredMicroversionSupport(
        {
          discoveryStatus: "unavailable",
          message: "",
          serviceType: "volume",
        },
        "3.0",
        "3.65",
        "Extended volume details",
      ),
    ).toMatchObject({
      status: "unknown",
      requestedMicroversion: "3.0",
    });
    expect(
      preferredMicroversionSupport(
        {
          ...available,
          configuredMicroversionMaximum: "3.60",
          microversions: { minimum: "3.61", maximum: "3.71" },
        },
        "3.0",
        "3.65",
        "Extended volume details",
      ),
    ).toMatchObject({
      status: "unsupported",
      message: expect.stringContaining("cloud's minimum 3.61"),
    });
  });

  it("normalizes Neutron extension aliases and distinguishes absence from discovery failure", () => {
    expect(
      parseExtensionAliases({
        extensions: [
          { alias: "security-group" },
          { alias: "extraroute" },
          { alias: "extraroute-atomic" },
          { alias: "extraroute" },
          { name: "invalid" },
        ],
      }),
    ).toEqual(["extraroute", "extraroute-atomic", "security-group"]);
    expect(parseExtensionAliases({ extensions: [] })).toEqual([]);
    expect(parseExtensionAliases({})).toBeNull();

    const capabilities: OpenStackServiceCapabilities = {
      discoveryStatus: "available",
      extensions: ["security-group"],
      message: "",
      serviceType: "network",
    };
    expect(
      extensionSupport(capabilities, "security-group", "Security groups"),
    ).toMatchObject({ status: "supported" });
    expect(
      extensionSupport(capabilities, "extraroute", "Static routes"),
    ).toMatchObject({
      status: "unsupported",
      message: expect.stringContaining("extraroute"),
    });
  });
});
