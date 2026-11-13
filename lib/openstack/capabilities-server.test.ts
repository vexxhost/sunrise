import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("discovers Neutron extension aliases, including a confirmed empty set", async () => {
    mocks.openstackRequest.mockResolvedValue({
      extensions: [{ alias: "extraroute" }, { alias: "security-group" }],
    });
    await expect(
      discoverNetworkCapabilities("RegionOne"),
    ).resolves.toMatchObject({
      discoveryStatus: "available",
      extensions: ["extraroute", "security-group"],
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
});
