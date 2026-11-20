import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverNetworkCapabilities: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  getSession: vi.fn(),
  guardMutationContext: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  discoverNetworkCapabilities: mocks.discoverNetworkCapabilities,
  NEUTRON_FLOATING_IP_PORT_FORWARDING_DESCRIPTION_EXTENSION:
    "floating-ip-port-forwarding-description",
  NEUTRON_FLOATING_IP_PORT_FORWARDING_EXTENSION: "floating-ip-port-forwarding",
  NEUTRON_FLOATING_IP_PORT_FORWARDING_PORT_RANGES_EXTENSION:
    "floating-ip-port-forwarding-port-ranges",
}));
vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));
vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
}));

import {
  createFloatingIpPortForwardingAction,
  deleteFloatingIpPortForwardingAction,
  listProjectFloatingIpPortForwardings,
  updateFloatingIpPortForwardingAction,
} from "@/lib/openstack/neutron-port-forwarding-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };
const extensions = [
  "floating-ip-port-forwarding",
  "floating-ip-port-forwarding-description",
  "floating-ip-port-forwarding-port-ranges",
];

function floatingIpPayload(overrides: Record<string, unknown> = {}) {
  return {
    floatingip: {
      id: "floating-a",
      port_id: null,
      project_id: "project-a",
      tenant_id: "project-a",
      ...overrides,
    },
  };
}

function portPayload(overrides: Record<string, unknown> = {}) {
  return {
    port: {
      id: "port-a",
      project_id: "project-a",
      tenant_id: "project-a",
      network_id: "network-a",
      fixed_ips: [{ ip_address: "10.0.0.5", subnet_id: "subnet-a" }],
      ...overrides,
    },
  };
}

function networkPayload(overrides: Record<string, unknown> = {}) {
  return {
    network: {
      id: "network-a",
      "router:external": false,
      ...overrides,
    },
  };
}

describe("Neutron floating IP port forwarding actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      projectId: "project-a",
      regionId: "RegionOne",
    });
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { scope },
    });
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions,
      message: "",
      serviceType: "network",
    });
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path === "/v2.0/floatingips/floating-a") {
        return floatingIpPayload();
      }
      if (path === "/v2.0/ports/port-a") return portPayload();
      if (path === "/v2.0/networks/network-a") return networkPayload();
      if (path.endsWith("/port_forwardings")) {
        return {
          port_forwardings: [
            {
              id: "rule-a",
              internal_ip_address: "10.0.0.5",
              internal_port: 80,
              internal_port_id: "port-a",
              external_port: 8080,
              protocol: "tcp",
            },
          ],
        };
      }
      return null;
    });
    mocks.executeOpenStackMutation.mockImplementation(async (options) => ({
      ok: true,
      status: "success",
      data: null,
      message: options.successMessage,
      scope,
    }));
  });

  it("lists rules only inside the active project scope", async () => {
    await expect(
      listProjectFloatingIpPortForwardings(
        "RegionOne",
        "project-a",
        "floating-a",
      ),
    ).resolves.toEqual([
      expect.objectContaining({ id: "rule-a", external_port: 8080 }),
    ]);

    mocks.getSession.mockResolvedValue({
      projectId: "project-b",
      regionId: "RegionOne",
    });
    await expect(
      listProjectFloatingIpPortForwardings(
        "RegionOne",
        "project-a",
        "floating-a",
      ),
    ).rejects.toThrow("project does not match");
  });

  it("does not expose a foreign parent through the scoped list", async () => {
    mocks.openstackRequest.mockResolvedValue(
      floatingIpPayload({ project_id: "project-b", tenant_id: "project-b" }),
    );
    await expect(
      listProjectFloatingIpPortForwardings(
        "RegionOne",
        "project-a",
        "floating-a",
      ),
    ).rejects.toThrow("not found in the active project");
  });

  it("creates a singular forwarding rule with only singular port fields", async () => {
    await createFloatingIpPortForwardingAction(scope, "floating-a", {
      description: "HTTPS",
      externalPortStart: 443,
      internalIpAddress: "10.0.0.5",
      internalPortId: "port-a",
      internalPortStart: 8443,
      protocol: "tcp",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          port_forwarding: {
            description: "HTTPS",
            external_port: 443,
            internal_ip_address: "10.0.0.5",
            internal_port: 8443,
            internal_port_id: "port-a",
            protocol: "tcp",
          },
        },
        method: "POST",
        path: "/v2.0/floatingips/floating-a/port_forwardings",
      }),
    );
  });

  it("creates a public range mapped to one internal port", async () => {
    await createFloatingIpPortForwardingAction(scope, "floating-a", {
      externalPortStart: 8_000,
      externalPortEnd: 8_010,
      internalIpAddress: "10.0.0.5",
      internalPortId: "port-a",
      internalPortStart: 9_000,
      protocol: "udp",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          port_forwarding: {
            external_port_range: "8000:8010",
            internal_ip_address: "10.0.0.5",
            internal_port_id: "port-a",
            internal_port_range: "9000",
            protocol: "udp",
          },
        },
      }),
    );
  });

  it("updates singular protocol and external-port fields allowed by Neutron", async () => {
    await updateFloatingIpPortForwardingAction(scope, "floating-a", "rule-a", {
      description: "DNS",
      externalPortStart: 53,
      internalIpAddress: "10.0.0.5",
      internalPortId: "port-a",
      internalPortStart: 5353,
      protocol: "udp",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          port_forwarding: {
            description: "DNS",
            external_port: 53,
            internal_ip_address: "10.0.0.5",
            internal_port: 5353,
            internal_port_id: "port-a",
            protocol: "udp",
          },
        },
        method: "PUT",
        path: "/v2.0/floatingips/floating-a/port_forwardings/rule-a",
      }),
    );
    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2.0/floatingips/floating-a/port_forwardings",
      }),
    );
  });

  it("does not trust the vulnerable individual forwarding endpoint for ownership", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path === "/v2.0/floatingips/floating-a") {
        return floatingIpPayload();
      }
      if (path === "/v2.0/floatingips/floating-a/port_forwardings") {
        return { port_forwardings: [] };
      }
      if (
        path ===
        "/v2.0/floatingips/floating-a/port_forwardings/rule-from-another-floating-ip"
      ) {
        return {
          port_forwarding: {
            id: "rule-from-another-floating-ip",
            internal_ip_address: "10.0.0.5",
            internal_port: 80,
            internal_port_id: "port-a",
            external_port: 8080,
            protocol: "tcp",
          },
        };
      }
      return null;
    });

    const result = await updateFloatingIpPortForwardingAction(
      scope,
      "floating-a",
      "rule-from-another-floating-ip",
      {
        externalPortStart: 80,
        internalIpAddress: "10.0.0.5",
        internalPortId: "port-a",
        internalPortStart: 80,
        protocol: "tcp",
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "permission-denied" },
    });
    expect(mocks.openstackRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2.0/floatingips/floating-a/port_forwardings/rule-from-another-floating-ip",
      }),
    );
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("updates external and internal ranges allowed by Neutron", async () => {
    await updateFloatingIpPortForwardingAction(scope, "floating-a", "rule-a", {
      externalPortEnd: 8_010,
      externalPortStart: 8_000,
      internalIpAddress: "10.0.0.5",
      internalPortEnd: 9_010,
      internalPortId: "port-a",
      internalPortStart: 9_000,
      protocol: "tcp",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          port_forwarding: {
            external_port_range: "8000:8010",
            internal_ip_address: "10.0.0.5",
            internal_port_id: "port-a",
            internal_port_range: "9000:9010",
            protocol: "tcp",
          },
        },
        method: "PUT",
        path: "/v2.0/floatingips/floating-a/port_forwardings/rule-a",
      }),
    );
  });

  it("rejects ranges when the deployment does not advertise them", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["floating-ip-port-forwarding"],
      message: "",
      serviceType: "network",
    });

    const result = await createFloatingIpPortForwardingAction(
      scope,
      "floating-a",
      {
        externalPortStart: 8_000,
        externalPortEnd: 8_010,
        internalIpAddress: "10.0.0.5",
        internalPortId: "port-a",
        internalPortStart: 9_000,
        protocol: "tcp",
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "service-unavailable" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects an empty description when its extension is unavailable", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: ["floating-ip-port-forwarding"],
      message: "",
      serviceType: "network",
    });

    const result = await createFloatingIpPortForwardingAction(
      scope,
      "floating-a",
      {
        description: "",
        externalPortStart: 443,
        internalIpAddress: "10.0.0.5",
        internalPortId: "port-a",
        internalPortStart: 8443,
        protocol: "tcp",
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "service-unavailable" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects foreign ports and addresses not assigned to the target", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path.includes("floatingips")) return floatingIpPayload();
      if (path.includes("/ports/")) {
        return portPayload({ project_id: "project-b", tenant_id: "project-b" });
      }
      return null;
    });
    const foreign = await createFloatingIpPortForwardingAction(
      scope,
      "floating-a",
      {
        externalPortStart: 80,
        internalIpAddress: "10.0.0.5",
        internalPortId: "port-a",
        internalPortStart: 80,
        protocol: "tcp",
      },
    );
    expect(foreign).toMatchObject({
      ok: false,
      error: { code: "permission-denied" },
    });

    mocks.openstackRequest.mockImplementation(async ({ path }) =>
      path.includes("floatingips") ? floatingIpPayload() : portPayload(),
    );
    const wrongAddress = await createFloatingIpPortForwardingAction(
      scope,
      "floating-a",
      {
        externalPortStart: 80,
        internalIpAddress: "10.0.0.99",
        internalPortId: "port-a",
        internalPortStart: 80,
        protocol: "tcp",
      },
    );
    expect(wrongAddress).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects forwarding targets on external networks", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path.includes("floatingips")) return floatingIpPayload();
      if (path.includes("/ports/")) return portPayload();
      if (path.includes("/networks/")) {
        return networkPayload({ "router:external": true });
      }
      return null;
    });

    const result = await createFloatingIpPortForwardingAction(
      scope,
      "floating-a",
      {
        externalPortStart: 80,
        internalIpAddress: "10.0.0.5",
        internalPortId: "port-a",
        internalPortStart: 80,
        protocol: "tcp",
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: expect.stringContaining("internal network"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("reports invalid update IDs in the guarded active scope", async () => {
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: {
        scope: { projectId: "project-active", regionId: "RegionActive" },
      },
    });

    const result = await updateFloatingIpPortForwardingAction(
      scope,
      "floating-a",
      "",
      {
        externalPortStart: 80,
        internalIpAddress: "10.0.0.5",
        internalPortId: "port-a",
        internalPortStart: 80,
        protocol: "tcp",
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
      scope: { projectId: "project-active", regionId: "RegionActive" },
    });
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
  });

  it("blocks mutation while the floating IP is directly associated", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) =>
      path.includes("floatingips")
        ? floatingIpPayload({ port_id: "associated-port" })
        : portPayload(),
    );
    const result = await deleteFloatingIpPortForwardingAction(
      scope,
      "floating-a",
      "rule-a",
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: expect.stringContaining("Disassociate"),
      },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });
});
