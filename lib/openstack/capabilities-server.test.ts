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
  discoverContainerInfrastructureCapabilities,
  discoverLoadBalancerCapabilities,
  discoverNetworkCapabilities,
  discoverSharedFileSystemCapabilities,
  magnumDetailApiVersion,
  manilaDetailApiVersion,
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

  it("discovers the Magnum range from the unversioned service root", async () => {
    vi.stubEnv("SUNRISE_API_MICROVERSION_CONTAINER_INFRA", "1.14");
    vi.stubEnv("SUNRISE_API_MICROVERSION_CONTAINER_INFRA_REGIONONE", "1.12");
    mocks.getServiceEndpoint.mockResolvedValue(
      "https://container-infra.example.test/v1",
    );
    mocks.openstackRequest.mockResolvedValue({
      version: {
        min_version: "1.1",
        status: "CURRENT",
        max_version: "1.12",
      },
    });

    await expect(
      discoverContainerInfrastructureCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      configuredMicroversionMaximum: "1.12",
      discoveryStatus: "available",
      microversions: { minimum: "1.1", maximum: "1.12" },
      serviceType: "container-infra",
    });
    expect(mocks.getServiceEndpoint).toHaveBeenCalledWith(
      "RegionOne",
      "container-infra",
      "magnum",
      "project-token",
    );
    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      acceptedStatuses: [300],
      endpointOverride: "https://container-infra.example.test/",
      path: "/",
      regionId: "RegionOne",
      serviceName: "magnum",
      serviceType: "container-infra",
    });
  });

  it("negotiates Magnum detail reads across 1.12 through 1.14", async () => {
    mocks.getServiceEndpoint.mockResolvedValue(
      "https://container-infra.example.test/v1",
    );
    mocks.openstackRequest.mockResolvedValue({
      version: {
        min_version: "1.1",
        status: "CURRENT",
        version: "1.12",
      },
    });
    await expect(magnumDetailApiVersion("RegionOne")).resolves.toBe(
      "container-infra 1.12",
    );

    vi.stubEnv("SUNRISE_API_MICROVERSION_CONTAINER_INFRA_REGIONONE", "1.13");
    mocks.openstackRequest.mockResolvedValue({
      version: {
        min_version: "1.1",
        status: "CURRENT",
        version: "1.14",
      },
    });
    await expect(magnumDetailApiVersion("RegionOne")).resolves.toBe(
      "container-infra 1.13",
    );

    mocks.getServiceEndpoint.mockResolvedValue(null);
    await expect(magnumDetailApiVersion("RegionOne")).resolves.toBe(
      "container-infra 1.12",
    );
  });

  it("discovers the Octavia additive API range and regional ceiling", async () => {
    vi.stubEnv("SUNRISE_API_MICROVERSION_LOAD_BALANCER", "2.20");
    vi.stubEnv("SUNRISE_API_MICROVERSION_LOAD_BALANCER_REGIONONE", "2.14");
    mocks.getServiceEndpoint.mockResolvedValue(
      "https://load-balancer.example.test/octavia/v2",
    );
    mocks.openstackRequest.mockResolvedValue({
      versions: [
        { id: "v2.0", status: "SUPPORTED" },
        { id: "v2.14", status: "SUPPORTED" },
        { id: "v2.30", status: "CURRENT" },
      ],
    });

    await expect(
      discoverLoadBalancerCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      configuredMicroversionMaximum: "2.14",
      discoveryStatus: "available",
      microversions: { minimum: "2.0", maximum: "2.30" },
      serviceType: "load-balancer",
    });
    expect(mocks.getServiceEndpoint).toHaveBeenCalledWith(
      "RegionOne",
      "load-balancer",
      "octavia",
      "project-token",
    );
    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      acceptedStatuses: [300],
      endpointOverride: "https://load-balancer.example.test/octavia",
      path: "/",
      regionId: "RegionOne",
      serviceName: "octavia",
      serviceType: "load-balancer",
    });
  });

  it("returns unknown-safe Octavia capabilities for malformed discovery", async () => {
    mocks.getServiceEndpoint.mockResolvedValue(
      "https://load-balancer.example.test/",
    );
    mocks.openstackRequest.mockResolvedValue({
      versions: [{ id: "v2.30", status: "EXPERIMENTAL" }],
    });

    await expect(
      discoverLoadBalancerCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      discoveryStatus: "unavailable",
      serviceType: "load-balancer",
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

  it("discovers the Manila microversion range and regional ceiling", async () => {
    vi.stubEnv("SUNRISE_API_MICROVERSION_SHARE", "2.70");
    vi.stubEnv("SUNRISE_API_MICROVERSION_SHARE_REGIONONE", "2.69");
    mocks.getServiceEndpoint.mockResolvedValue(
      "https://share.example.test/v2/project-a",
    );
    mocks.openstackRequest.mockResolvedValue({
      version: {
        min_version: "2.0",
        status: "CURRENT",
        version: "2.89",
      },
    });

    await expect(
      discoverSharedFileSystemCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      configuredMicroversionMaximum: "2.69",
      discoveryStatus: "available",
      microversions: { minimum: "2.0", maximum: "2.89" },
      serviceType: "share",
    });
    expect(mocks.getServiceEndpoint).toHaveBeenCalledWith(
      "RegionOne",
      "sharev2",
      "manila",
      "project-token",
    );
    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      acceptedStatuses: [300],
      endpointOverride: "https://share.example.test/v2",
      path: "/",
      regionId: "RegionOne",
      serviceName: "manila",
      serviceType: "sharev2",
    });
  });

  it("negotiates Manila detail reads and falls back safely", async () => {
    mocks.getServiceEndpoint.mockResolvedValue(
      "https://share.example.test/v2/project-a",
    );
    mocks.openstackRequest.mockResolvedValue({
      version: {
        min_version: "2.0",
        status: "CURRENT",
        version: "2.65",
      },
    });

    await expect(manilaDetailApiVersion("RegionOne")).resolves.toBe("2.65");

    mocks.getServiceEndpoint.mockResolvedValue(null);
    await expect(manilaDetailApiVersion("RegionOne")).resolves.toBe("2.51");
  });

  it("discovers Neutron extension aliases, including a confirmed empty set", async () => {
    mocks.openstackRequest.mockResolvedValue({
      extensions: [
        { alias: "extraroute" },
        { alias: "extraroute-atomic" },
        { alias: "port-security" },
        { alias: "security-group" },
      ],
    });
    await expect(
      discoverNetworkCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      discoveryStatus: "available",
      extensions: [
        "extraroute",
        "extraroute-atomic",
        "port-security",
        "security-group",
      ],
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
