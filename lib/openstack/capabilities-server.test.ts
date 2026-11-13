import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceEndpoint: vi.fn(),
  getSession: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));
vi.mock("@/lib/openstack/catalog", () => ({
  getServiceEndpoint: mocks.getServiceEndpoint,
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import {
  cinderDetailApiVersion,
  discoverBlockStorageCapabilities,
  discoverComputeCapabilities,
  discoverNetworkCapabilities,
} from "@/lib/openstack/capabilities-server";

describe("OpenStack capability discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      keystoneProjectToken: "project-token",
    });
    mocks.getServiceEndpoint.mockResolvedValue(
      "https://compute.example.test/v2.1/project-a",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("discovers the Nova microversion range", async () => {
    mocks.openstackRequest.mockResolvedValue({
      version: {
        min_version: "2.1",
        status: "CURRENT",
        version: "2.100",
      },
    });

    await expect(
      discoverComputeCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      discoveryStatus: "available",
      microversions: { minimum: "2.1", maximum: "2.100" },
    });
    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      acceptedStatuses: [300],
      endpointOverride: "https://compute.example.test/v2.1",
      path: "/",
      regionId: "RegionOne",
      serviceName: "nova",
      serviceType: "compute",
    });
  });

  it("includes the effective regional Nova microversion ceiling", async () => {
    vi.stubEnv("SUNRISE_API_MICROVERSION_COMPUTE", "2.95");
    vi.stubEnv("SUNRISE_API_MICROVERSION_COMPUTE_REGIONONE", "2.90");
    mocks.openstackRequest.mockResolvedValue({
      version: {
        min_version: "2.1",
        status: "CURRENT",
        version: "2.100",
      },
    });

    await expect(
      discoverComputeCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      configuredMicroversionMaximum: "2.90",
      discoveryStatus: "available",
      message: expect.stringContaining("not request newer than 2.90"),
    });
  });

  it("discovers the Cinder microversion range and regional ceiling", async () => {
    vi.stubEnv("SUNRISE_API_MICROVERSION_VOLUME", "3.71");
    vi.stubEnv("SUNRISE_API_MICROVERSION_VOLUME_REGIONONE", "3.66");
    mocks.getServiceEndpoint.mockResolvedValue(
      "https://volume.example.test/v3/project-a",
    );
    mocks.openstackRequest.mockResolvedValue({
      version: {
        min_version: "3.0",
        status: "CURRENT",
        version: "3.71",
      },
    });

    await expect(
      discoverBlockStorageCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      configuredMicroversionMaximum: "3.66",
      discoveryStatus: "available",
      microversions: { minimum: "3.0", maximum: "3.71" },
      serviceType: "volume",
    });
    expect(mocks.getServiceEndpoint).toHaveBeenCalledWith(
      "RegionOne",
      "volumev3",
      "cinder",
      "project-token",
    );
    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      acceptedStatuses: [300],
      endpointOverride: "https://volume.example.test/v3",
      path: "/",
      regionId: "RegionOne",
      serviceName: "cinder",
      serviceType: "volumev3",
    });
  });

  it("selects the richest Cinder detail microversion supported by the cloud", async () => {
    mocks.getServiceEndpoint.mockResolvedValue(
      "https://volume.example.test/v3/project-a",
    );
    mocks.openstackRequest.mockResolvedValue({
      version: {
        min_version: "3.0",
        status: "CURRENT",
        version: "3.64",
      },
    });

    await expect(cinderDetailApiVersion("RegionOne")).resolves.toBe(
      "volume 3.64",
    );
  });

  it("uses the Cinder baseline when detail discovery is unavailable", async () => {
    mocks.getServiceEndpoint.mockResolvedValue(null);

    await expect(cinderDetailApiVersion("RegionOne")).resolves.toBe(
      "volume 3.0",
    );
  });

  it("discovers Neutron extension aliases, including a confirmed empty set", async () => {
    mocks.openstackRequest.mockResolvedValue({
      extensions: [
        { alias: "extraroute" },
        { alias: "extraroute-atomic" },
        { alias: "security-group" },
      ],
    });
    await expect(
      discoverNetworkCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      discoveryStatus: "available",
      extensions: ["extraroute", "extraroute-atomic", "security-group"],
    });

    mocks.openstackRequest.mockResolvedValueOnce({ extensions: [] });
    await expect(
      discoverNetworkCapabilities("RegionTwo"),
    ).resolves.toMatchObject({
      discoveryStatus: "available",
      extensions: [],
    });
  });

  it("returns an unknown-safe state when a probe cannot be parsed", async () => {
    mocks.openstackRequest.mockResolvedValue(null);

    await expect(
      discoverComputeCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      discoveryStatus: "unavailable",
      serviceType: "compute",
    });
    await expect(
      discoverNetworkCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      discoveryStatus: "unavailable",
      serviceType: "network",
    });
  });

  it("distinguishes a recognized API without microversions from a failed probe", async () => {
    mocks.openstackRequest.mockResolvedValue({
      version: {
        id: "v2.0",
        min_version: "",
        status: "SUPPORTED",
        version: "",
      },
    });

    await expect(
      discoverComputeCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      discoveryStatus: "available",
      microversions: null,
      message: expect.stringContaining("does not advertise"),
    });
  });
});
