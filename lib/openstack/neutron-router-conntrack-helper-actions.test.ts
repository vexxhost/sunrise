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
  NEUTRON_L3_CONNTRACK_HELPER_EXTENSION: "l3-conntrack-helper",
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
  createRouterConntrackHelperAction,
  deleteRouterConntrackHelperAction,
  listProjectRouterConntrackHelpers,
  updateRouterConntrackHelperAction,
} from "@/lib/openstack/neutron-router-conntrack-helper-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };

function routerPayload(overrides: Record<string, unknown> = {}) {
  return {
    router: {
      id: "router-a",
      project_id: "project-a",
      tenant_id: "project-a",
      ...overrides,
    },
  };
}

function helperPayload(overrides: Record<string, unknown> = {}) {
  return {
    conntrack_helper: {
      helper: "ftp",
      id: "helper-a",
      port: 21,
      protocol: "tcp",
      ...overrides,
    },
  };
}

describe("Neutron router conntrack helper actions", () => {
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
      extensions: ["l3-conntrack-helper"],
      message: "",
      serviceType: "network",
    });
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path === "/v2.0/routers/router-a") return routerPayload();
      if (path === "/v2.0/routers/router-a/conntrack_helpers") {
        return { conntrack_helpers: [helperPayload().conntrack_helper] };
      }
      if (path === "/v2.0/routers/router-a/conntrack_helpers/helper-a") {
        return helperPayload();
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

  it("lists helpers only inside the active project and region", async () => {
    await expect(
      listProjectRouterConntrackHelpers("regionone", "project-a", "router-a"),
    ).resolves.toEqual([
      { helper: "ftp", id: "helper-a", port: 21, protocol: "tcp" },
    ]);

    mocks.getSession.mockResolvedValue({
      projectId: "project-b",
      regionId: "RegionOne",
    });
    await expect(
      listProjectRouterConntrackHelpers("RegionOne", "project-a", "router-a"),
    ).rejects.toThrow("project does not match");
  });

  it("does not expose helpers from a foreign router", async () => {
    mocks.openstackRequest.mockResolvedValue(
      routerPayload({ project_id: "project-b", tenant_id: "project-b" }),
    );

    await expect(
      listProjectRouterConntrackHelpers("RegionOne", "project-a", "router-a"),
    ).rejects.toThrow("not found in the active project");
  });

  it("does not expose helpers when the parent response has another ID", async () => {
    mocks.openstackRequest.mockResolvedValue(routerPayload({ id: "router-b" }));

    await expect(
      listProjectRouterConntrackHelpers("RegionOne", "project-a", "router-a"),
    ).rejects.toThrow("not found in the active project");
  });

  it("rejects malformed helper collections", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path === "/v2.0/routers/router-a") return routerPayload();
      return {
        conntrack_helpers: [
          { helper: "ftp", id: "helper-a", port: "21", protocol: "tcp" },
        ],
      };
    });

    await expect(
      listProjectRouterConntrackHelpers("RegionOne", "project-a", "router-a"),
    ).rejects.toThrow("Invalid Neutron router conntrack helper response");
  });

  it("rejects response ports outside Neutron's valid range", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path === "/v2.0/routers/router-a") return routerPayload();
      return {
        conntrack_helpers: [
          { helper: "ftp", id: "helper-a", port: 65_536, protocol: "tcp" },
        ],
      };
    });

    await expect(
      listProjectRouterConntrackHelpers("RegionOne", "project-a", "router-a"),
    ).rejects.toThrow("Invalid Neutron router conntrack helper response");
  });

  it("creates a helper with the exact Neutron subresource body", async () => {
    await createRouterConntrackHelperAction(scope, "router-a", {
      helper: " tftp ",
      port: 69,
      protocol: "udp",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          conntrack_helper: { helper: "tftp", port: 69, protocol: "udp" },
        },
        method: "POST",
        path: "/v2.0/routers/router-a/conntrack_helpers",
      }),
    );
  });

  it("re-reads the nested helper before updating it", async () => {
    await updateRouterConntrackHelperAction(scope, "router-a", "helper-a", {
      helper: "sip",
      port: 5060,
      protocol: "udp",
    });

    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2.0/routers/router-a/conntrack_helpers/helper-a",
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          conntrack_helper: {
            helper: "sip",
            port: 5060,
            protocol: "udp",
          },
        },
        method: "PUT",
        path: "/v2.0/routers/router-a/conntrack_helpers/helper-a",
      }),
    );
  });

  it("re-reads the nested helper before deleting it", async () => {
    await deleteRouterConntrackHelperAction(scope, "router-a", "helper-a");

    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2.0/routers/router-a/conntrack_helpers/helper-a",
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        path: "/v2.0/routers/router-a/conntrack_helpers/helper-a",
      }),
    );
  });

  it("stops updates when the nested helper cannot be verified", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) =>
      path === "/v2.0/routers/router-a" ? routerPayload() : null,
    );

    const result = await updateRouterConntrackHelperAction(
      scope,
      "router-a",
      "helper-a",
      { helper: "ftp", port: 21, protocol: "tcp" },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "service-error" }),
      }),
    );
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("stops updates when the nested response has another ID", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path === "/v2.0/routers/router-a") return routerPayload();
      return helperPayload({ id: "helper-b" });
    });

    const result = await updateRouterConntrackHelperAction(
      scope,
      "router-a",
      "helper-a",
      { helper: "ftp", port: 21, protocol: "tcp" },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "service-error" }),
      }),
    );
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects invalid input before discovery or Neutron requests", async () => {
    const result = await createRouterConntrackHelperAction(scope, "router-a", {
      helper: "ftp",
      port: 0,
      protocol: "gre" as "tcp",
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "validation-failed" }),
      }),
    );
    expect(mocks.discoverNetworkCapabilities).not.toHaveBeenCalled();
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects mutations when the extension is confirmed unsupported", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "available",
      extensions: [],
      message: "",
      serviceType: "network",
    });

    const result = await createRouterConntrackHelperAction(scope, "router-a", {
      helper: "ftp",
      port: 21,
      protocol: "tcp",
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "service-unavailable" }),
      }),
    );
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });

  it("defers to Neutron when capability discovery is inconclusive", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue({
      discoveryStatus: "unavailable",
      message: "Discovery unavailable",
      serviceType: "network",
    });

    await createRouterConntrackHelperAction(scope, "router-a", {
      helper: "ftp",
      port: 21,
      protocol: "tcp",
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledOnce();
  });

  it("rejects mutations against a router owned by another project", async () => {
    mocks.openstackRequest.mockResolvedValue(
      routerPayload({ project_id: "project-b", tenant_id: "project-b" }),
    );

    const result = await createRouterConntrackHelperAction(scope, "router-a", {
      helper: "ftp",
      port: 21,
      protocol: "tcp",
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "permission-denied" }),
      }),
    );
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("encodes router and helper IDs before building nested paths", async () => {
    mocks.openstackRequest.mockImplementation(async ({ path }) => {
      if (path === "/v2.0/routers/router%2Fa") {
        return routerPayload({ id: "router/a" });
      }
      if (path === "/v2.0/routers/router%2Fa/conntrack_helpers/helper%2Fa") {
        return helperPayload({ id: "helper/a" });
      }
      return null;
    });

    await deleteRouterConntrackHelperAction(scope, "router/a", "helper/a");

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2.0/routers/router%2Fa/conntrack_helpers/helper%2Fa",
      }),
    );
  });
});
