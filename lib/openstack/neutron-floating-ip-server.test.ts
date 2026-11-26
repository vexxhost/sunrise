import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));

import {
  listFloatingIpsForAddresses,
  listFloatingIpsForPort,
  listUnassociatedFloatingIps,
} from "@/lib/openstack/neutron-floating-ip-server";
import { OpenStackRequestError } from "@/lib/openstack/request";

const firstId = "11111111-1111-1111-1111-111111111111";
const secondId = "22222222-2222-2222-2222-222222222222";
const markerId = "33333333-3333-3333-3333-333333333333";
const portId = "44444444-4444-4444-4444-444444444444";

function floatingIp(id: string, address: string, projectId = "project-a") {
  return {
    floating_ip_address: address,
    id,
    port_id: portId,
    project_id: projectId,
  };
}

describe("Neutron floating IP references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      projectId: "project-a",
      regionId: "RegionOne",
    });
  });

  it("queries exact addresses and follows prefixed pagination links", async () => {
    mocks.openstackRequest
      .mockResolvedValueOnce({
        floatingips: [
          floatingIp(firstId, "203.0.113.10"),
          floatingIp(secondId, "203.0.113.10", "project-b"),
        ],
        floatingips_links: [
          {
            href: `https://neutron.example/prefix/v2.0/floatingips?limit=1&marker=${markerId}`,
            rel: "next",
          },
        ],
      })
      .mockResolvedValueOnce({
        floatingips: [floatingIp(secondId, "203.0.113.10")],
      });

    await expect(
      listFloatingIpsForAddresses(["203.0.113.10"], "RegionOne", "project-a"),
    ).resolves.toEqual([
      {
        floating_ip_address: "203.0.113.10",
        id: firstId,
        port_id: portId,
      },
      {
        floating_ip_address: "203.0.113.10",
        id: secondId,
        port_id: portId,
      },
    ]);
    expect(mocks.openstackRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: "/v2.0/floatingips?limit=100&project_id=project-a&floating_ip_address=203.0.113.10",
      }),
    );
    expect(mocks.openstackRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: `/v2.0/floatingips?limit=100&project_id=project-a&floating_ip_address=203.0.113.10&marker=${markerId}`,
      }),
    );
  });

  it("queries only the selected VIP port", async () => {
    mocks.openstackRequest.mockResolvedValueOnce({
      floatingips: [floatingIp(firstId, "203.0.113.10")],
    });

    await expect(
      listFloatingIpsForPort(portId, "RegionOne", "project-a"),
    ).resolves.toHaveLength(1);
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v2.0/floatingips?limit=100&project_id=project-a&port_id=${portId}`,
      }),
    );
  });

  it("deduplicates address filters before issuing requests", async () => {
    mocks.openstackRequest.mockResolvedValueOnce({ floatingips: [] });

    await expect(
      listFloatingIpsForAddresses(["203.0.113.10", "203.0.113.10"]),
    ).resolves.toEqual([]);
    expect(mocks.openstackRequest).toHaveBeenCalledTimes(1);
  });

  it("only offers unused project IPv4 addresses and keeps the project filter on later pages", async () => {
    const freeIp = {
      ...floatingIp(firstId, "203.0.113.10"),
      fixed_ip_address: null,
      port_id: null,
      router_id: null,
    };
    mocks.openstackRequest
      .mockResolvedValueOnce({
        floatingips: [
          { ...freeIp, project_id: "project-b" },
          { ...freeIp, floating_ip_address: "2001:db8::1" },
          { ...freeIp, port_id: portId },
          { ...freeIp, port_forwardings: [{ protocol: "tcp" }] },
          { ...freeIp, router_id: portId },
        ],
        floatingips_links: [
          {
            href: `/v2.0/floatingips?marker=${markerId}&project_id=project-b`,
            rel: "next",
          },
        ],
      })
      .mockResolvedValueOnce({ floatingips: [freeIp] });
    await expect(
      listUnassociatedFloatingIps("RegionOne", "project-a"),
    ).resolves.toEqual([
      {
        floating_ip_address: freeIp.floating_ip_address,
        id: firstId,
        port_id: null,
        fixed_ip_address: null,
      },
    ]);
    expect(mocks.openstackRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: `/v2.0/floatingips?limit=100&project_id=project-a&marker=${markerId}`,
      }),
    );
  });

  it("rejects malformed responses instead of reporting an empty match", async () => {
    mocks.openstackRequest.mockResolvedValueOnce(null);

    await expect(listFloatingIpsForAddresses(["203.0.113.10"])).rejects.toThrow(
      "Invalid Neutron floating IP response",
    );
  });

  it("rejects malformed floating IP records", async () => {
    mocks.openstackRequest.mockResolvedValueOnce({
      floatingips: [
        {
          floating_ip_address: "not-an-address",
          id: firstId,
          port_id: portId,
          project_id: "project-a",
        },
      ],
    });

    await expect(listFloatingIpsForAddresses(["203.0.113.10"])).rejects.toThrow(
      "Invalid Neutron floating IP item",
    );
  });

  it("rejects pagination links outside the floating IP collection", async () => {
    mocks.openstackRequest.mockResolvedValueOnce({
      floatingips: [],
      floatingips_links: [
        {
          href: `https://neutron.example/v2.0/networks?marker=${markerId}`,
          rel: "next",
        },
      ],
    });

    await expect(listFloatingIpsForAddresses(["203.0.113.10"])).rejects.toThrow(
      "Invalid Neutron floating IP pagination target",
    );
  });

  it("rejects repeated pagination targets", async () => {
    const nextLink = {
      href: `https://neutron.example/v2.0/floatingips?marker=${markerId}`,
      rel: "next",
    };
    mocks.openstackRequest
      .mockResolvedValueOnce({ floatingips: [], floatingips_links: [nextLink] })
      .mockResolvedValueOnce({
        floatingips: [],
        floatingips_links: [nextLink],
      });

    await expect(listFloatingIpsForAddresses(["203.0.113.10"])).rejects.toThrow(
      "Invalid Neutron floating IP pagination",
    );
    expect(mocks.openstackRequest).toHaveBeenCalledTimes(2);
  });

  it("rejects non-IP filters and malformed port IDs before requesting data", async () => {
    await expect(
      listFloatingIpsForAddresses(["cluster.example.test"]),
    ).rejects.toThrow("require IP addresses");
    await expect(listFloatingIpsForPort("../other-port")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError && error.status === 404,
    );
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });

  it("rejects stale client scope before requesting data", async () => {
    await expect(
      listFloatingIpsForAddresses(["203.0.113.10"], "RegionTwo", "project-a"),
    ).rejects.toThrow("region does not match");
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });
});
