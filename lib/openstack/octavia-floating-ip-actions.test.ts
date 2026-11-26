import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mutationErrorForStatus, mutationFailure } from "@/lib/mutations";
import { OpenStackRequestError } from "@/lib/openstack/request";

const mocks = vi.hoisted(() => ({
  guardMutationContext: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  getLoadBalancer: vi.fn(),
  openstackRequest: vi.fn(),
  discoverNetworkCapabilities: vi.fn(),
}));

vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  discoverNetworkCapabilities: mocks.discoverNetworkCapabilities,
  NEUTRON_FLOATING_IP_PORT_FORWARDING_EXTENSION: "floating-ip-port-forwarding",
  NEUTRON_REVISION_IF_MATCH_EXTENSION: "revision-if-match",
}));
vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/octavia-server", () => ({
  getLoadBalancer: mocks.getLoadBalancer,
}));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));
vi.mock("@/lib/openstack/neutron-floating-ip-server", () => ({
  listUnassociatedFloatingIps: vi.fn(),
}));

import { changeOctaviaFloatingIpAssociationAction } from "./octavia-floating-ip-actions";

const scope = {
  projectId: "297c1aa4ef4f42bf9fdb6a7c6ced78b2",
  regionId: "RegionOne",
};
const loadBalancerId = "4ed3f70c-5126-470d-be60-3710d8682220";
const vipPortId = "620630da-7cc9-45a3-97bc-f519aaa46066";
const floatingIpId = "283d1064-329f-4709-a0ae-764fc80cb23e";
const otherId = "564c3265-5933-44c7-a8da-3101e2e66a29";
const vipAddress = "10.0.0.17";
const base = { floatingIpId, vipAddress, vipPortId };
const fip = {
  id: floatingIpId,
  project_id: scope.projectId,
  floating_ip_address: "203.0.113.10",
  port_id: null,
  fixed_ip_address: null,
  router_id: null,
  revision_number: 3,
  port_forwardings: [],
};
const occupied = {
  ...fip,
  port_id: vipPortId,
  fixed_ip_address: vipAddress,
  router_id: otherId,
};
const loadBalancer = {
  id: loadBalancerId,
  provider: "amphorav2",
  provisioning_status: "ACTIVE",
  vip_address: vipAddress,
  vip_port_id: vipPortId,
};
const associate = () =>
  changeOctaviaFloatingIpAssociationAction(scope, loadBalancerId, {
    ...base,
    action: "associate",
  });
const disassociate = () =>
  changeOctaviaFloatingIpAssociationAction(scope, loadBalancerId, {
    ...base,
    action: "disassociate",
  });

describe("Octavia floating IP association", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { scope },
    });
    mocks.getLoadBalancer.mockResolvedValue(loadBalancer);
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["revision-if-match", "floating-ip-port-forwarding"],
    });
    mocks.openstackRequest.mockResolvedValue({ floatingip: fip });
    mocks.executeOpenStackMutation.mockResolvedValue({ ok: true });
  });

  it("uses the primary VIP and a Neutron revision precondition without resending other settings", async () => {
    await expect(associate()).resolves.toMatchObject({ ok: true });
    expect(mocks.getLoadBalancer).toHaveBeenCalledWith(
      loadBalancerId,
      scope.regionId,
      scope.projectId,
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        scope,
        serviceName: "neutron",
        method: "PUT",
        path: `/v2.0/floatingips/${floatingIpId}`,
        headers: { "If-Match": '"revision_number=3"' },
        body: {
          floatingip: { port_id: vipPortId, fixed_ip_address: vipAddress },
        },
      }),
    );
    const { transform } = mocks.executeOpenStackMutation.mock.calls[0][0];
    expect(transform({ floatingip: occupied })).toBeNull();
    expect(() =>
      transform({ floatingip: { ...occupied, fixed_ip_address: "10.0.0.18" } }),
    ).toThrow();
    expect(() =>
      transform({ floatingip: { ...occupied, id: otherId } }),
    ).toThrow();
  });

  it("disassociates only the exact primary VIP without releasing the IP, even on an errored load balancer", async () => {
    mocks.getLoadBalancer.mockResolvedValue({
      ...loadBalancer,
      provisioning_status: "ERROR",
    });
    mocks.openstackRequest.mockResolvedValue({ floatingip: occupied });
    await expect(disassociate()).resolves.toMatchObject({ ok: true });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "PUT",
        path: `/v2.0/floatingips/${floatingIpId}`,
        body: { floatingip: { port_id: null } },
        headers: { "If-Match": '"revision_number=3"' },
      }),
    );
    const { transform } = mocks.executeOpenStackMutation.mock.calls[0][0];
    expect(transform({ floatingip: fip })).toBeNull();
    expect(() => transform({ floatingip: occupied })).toThrow();
  });

  it.each([
    { vip_port_id: otherId },
    { vip_address: "10.0.0.18" },
    { provider: "ovn" },
    { provisioning_status: "PENDING_UPDATE" },
  ])(
    "blocks writes when the Octavia VIP or resource state cannot be confirmed: %j",
    async (changes) => {
      mocks.getLoadBalancer.mockResolvedValue({ ...loadBalancer, ...changes });
      await expect(associate()).resolves.toMatchObject({ ok: false });
      expect(mocks.openstackRequest).not.toHaveBeenCalled();
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it.each([
    { project_id: "another-project" },
    { id: otherId },
    { port_id: otherId, fixed_ip_address: vipAddress },
    { router_id: otherId },
    { revision_number: undefined },
    { port_forwardings: [{ id: otherId }] },
    { port_id: undefined },
  ])(
    "rejects a stale, unverified, in-use, or foreign floating IP: %j",
    async (changes) => {
      mocks.openstackRequest.mockResolvedValue({
        floatingip: { ...fip, ...changes },
      });
      await expect(associate()).resolves.toMatchObject({ ok: false });
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it("checks for port-forwarding rules directly when the address does not report them", async () => {
    mocks.openstackRequest
      .mockResolvedValueOnce({
        floatingip: { ...fip, port_forwardings: undefined },
      })
      .mockResolvedValueOnce({ port_forwardings: [{ id: otherId }] });
    await expect(associate()).resolves.toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(mocks.openstackRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: `/v2.0/floatingips/${floatingIpId}/port_forwardings?limit=1`,
        errorMode: "throw",
      }),
    );
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not disassociate an address from a different port or a secondary address on the same port", async () => {
    for (const change of [
      { port_id: otherId },
      { fixed_ip_address: "10.0.0.18" },
    ]) {
      mocks.openstackRequest.mockResolvedValueOnce({
        floatingip: { ...occupied, ...change },
      });
      await expect(disassociate()).resolves.toMatchObject({
        ok: false,
        error: { code: "conflict" },
      });
    }
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("does not send an unguarded update when revision matching is unavailable", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: [],
    });
    await expect(associate()).resolves.toMatchObject({
      ok: false,
      error: { code: "service-unavailable" },
    });
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it.each([
    "getLoadBalancer",
    "discoverNetworkCapabilities",
    "openstackRequest",
  ] as const)(
    "passes the auth refresh redirect through when %s needs a new session",
    async (source) => {
      mocks[source].mockImplementationOnce(() => redirect("/auth/refresh"));
      await expect(associate()).rejects.toMatchObject({
        digest: expect.stringContaining(";/auth/refresh;"),
      });
      expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
    },
  );

  it("redirects to refresh when the final write is rejected with 401 without resending it", async () => {
    mocks.executeOpenStackMutation.mockResolvedValueOnce(
      mutationFailure(
        mutationErrorForStatus(401, "associate this floating IP"),
      ),
    );
    await expect(associate()).rejects.toMatchObject({
      digest: expect.stringContaining(";/auth/refresh;"),
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(1);
  });

  it("returns not-found if the selected address was released", async () => {
    mocks.openstackRequest.mockRejectedValueOnce(
      new OpenStackRequestError(404, "Not Found"),
    );
    await expect(disassociate()).resolves.toMatchObject({
      ok: false,
      error: { code: "not-found" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });
});
