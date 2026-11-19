import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));

import { getNetworkIpAvailability } from "@/lib/openstack/neutron-ip-availability-actions";
import { OpenStackRequestError } from "@/lib/openstack/request";

function payload() {
  return {
    network_ip_availability: {
      network_id: "network-a",
      network_name: "private",
      project_id: "project-a",
      total_ips: 253,
      used_ips: 4,
      subnet_ip_availability: [],
    },
  };
}

describe("Neutron network IP availability action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      projectId: "project-a",
      regionId: "RegionOne",
    });
  });

  it("loads and validates the selected network availability", async () => {
    mocks.openstackRequest.mockResolvedValue(payload());

    await expect(
      getNetworkIpAvailability("RegionOne", "project-a", "network-a"),
    ).resolves.toEqual({
      status: "available",
      availability: expect.objectContaining({
        network_id: "network-a",
        total_ips: 253,
        used_ips: 4,
      }),
    });
    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      regionId: "RegionOne",
      serviceType: "network",
      serviceName: "neutron",
      path: "/v2.0/network-ip-availabilities/network-a",
      errorMode: "throw",
    });
  });

  it.each([403, 404])(
    "represents a policy-hidden %s response without failing the page",
    async (status) => {
      mocks.openstackRequest.mockRejectedValue(
        new OpenStackRequestError(status, "Restricted"),
      );

      await expect(
        getNetworkIpAvailability("RegionOne", "project-a", "network-a"),
      ).resolves.toEqual({ status: "restricted" });
    },
  );

  it("does not hide service failures", async () => {
    const failure = new OpenStackRequestError(500, "Unavailable");
    mocks.openstackRequest.mockRejectedValue(failure);

    await expect(
      getNetworkIpAvailability("RegionOne", "project-a", "network-a"),
    ).rejects.toBe(failure);
  });

  it("rejects a different active project or region before requesting data", async () => {
    await expect(
      getNetworkIpAvailability("RegionTwo", "project-a", "network-a"),
    ).rejects.toThrow("region does not match");
    await expect(
      getNetworkIpAvailability("RegionOne", "project-b", "network-a"),
    ).rejects.toThrow("project does not match");
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });

  it("rejects unsafe resource identifiers", async () => {
    await expect(
      getNetworkIpAvailability("RegionOne", "project-a", "bad\npath"),
    ).rejects.toThrow("Invalid Neutron network ID");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
