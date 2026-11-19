import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverNetworkCapabilities: vi.fn(),
  executeOpenStackMutation: vi.fn(),
  guardMutationContext: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/capabilities-server", () => ({
  discoverNetworkCapabilities: mocks.discoverNetworkCapabilities,
  NEUTRON_STANDARD_ATTRIBUTE_REVISION_EXTENSION: "standard-attr-revisions",
  NEUTRON_STANDARD_ATTRIBUTE_TAG_EXTENSION: "standard-attr-tag",
}));
vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));

import { updateNeutronResourceTagsAction } from "@/lib/openstack/neutron-tag-actions";
import { OpenStackRequestError } from "@/lib/openstack/request";

const scope = { projectId: "project-a", regionId: "RegionOne" };

function capabilities(extensions?: string[]) {
  return {
    discoveryStatus: extensions
      ? ("available" as const)
      : ("unavailable" as const),
    extensions,
    message: extensions ? "Extensions discovered." : "Discovery unavailable.",
    serviceType: "network",
  };
}

function networkPayload(overrides: Record<string, unknown> = {}) {
  return {
    network: {
      id: "network-a",
      project_id: "project-a",
      revision_number: 7,
      tags: ["old"],
      ...overrides,
    },
  };
}

function routerPayload(overrides: Record<string, unknown> = {}) {
  return {
    router: {
      id: "router-a",
      project_id: "project-a",
      revision_number: 9,
      tags: ["old"],
      ...overrides,
    },
  };
}

function floatingIpPayload(overrides: Record<string, unknown> = {}) {
  return {
    floatingip: {
      id: "floating-ip-a",
      project_id: "project-a",
      revision_number: 11,
      tags: ["old"],
      ...overrides,
    },
  };
}

function securityGroupPayload(overrides: Record<string, unknown> = {}) {
  return {
    security_group: {
      id: "security-group-a",
      project_id: "project-a",
      revision_number: 13,
      tags: ["old"],
      ...overrides,
    },
  };
}

function portPayload(overrides: Record<string, unknown> = {}) {
  return {
    port: {
      id: "port-a",
      project_id: "project-a",
      revision_number: 15,
      tags: ["old"],
      ...overrides,
    },
  };
}

describe("Neutron resource tag mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { projectToken: "token", scope },
    });
    mocks.discoverNetworkCapabilities.mockResolvedValue(
      capabilities([
        "standard-attr-tag",
        "standard-attr-revisions",
        "revision-if-match",
      ]),
    );
    mocks.openstackRequest.mockResolvedValue(networkPayload());
    mocks.executeOpenStackMutation.mockResolvedValue({
      ok: true,
      status: "success",
      data: ["environment:production", "managed-by:terraform"],
      message: "Network tags saved.",
      scope,
    });
  });

  it("revalidates ownership and replaces network tags without a subresource precondition", async () => {
    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedRevisionNumber: 7,
        expectedTags: ["old"],
        tags: [" environment:production ", "", "line\nbreak"],
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      regionId: "RegionOne",
      serviceType: "network",
      serviceName: "neutron",
      path: "/v2.0/networks/network-a",
      errorMode: "throw",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          tags: [" environment:production ", "", "line\nbreak"],
        },
        method: "PUT",
        path: "/v2.0/networks/network-a/tags",
        scope,
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.not.objectContaining({ headers: expect.anything() }),
    );
  });

  it("reuses the guarded tag workflow for routers", async () => {
    mocks.openstackRequest.mockResolvedValue(routerPayload());

    await expect(
      updateNeutronResourceTagsAction(scope, "router", "router-a", {
        expectedRevisionNumber: 9,
        expectedTags: ["old"],
        tags: ["edge"],
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v2.0/routers/router-a" }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        actionLabel: "save router tags",
        body: { tags: ["edge"] },
        invalidates: [
          "/networking",
          "/networking/routers",
          "/networking/routers/router-a",
        ],
        path: "/v2.0/routers/router-a/tags",
        successMessage: "Router tags saved.",
      }),
    );
  });

  it("requires the matching router payload and active-project ownership", async () => {
    mocks.openstackRequest.mockResolvedValueOnce(networkPayload());
    await expect(
      updateNeutronResourceTagsAction(scope, "router", "router-a", {
        expectedRevisionNumber: 9,
        expectedTags: ["old"],
        tags: ["edge"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-response" },
    });

    mocks.openstackRequest.mockResolvedValueOnce(
      routerPayload({ project_id: "project-b" }),
    );
    await expect(
      updateNeutronResourceTagsAction(scope, "router", "router-a", {
        expectedRevisionNumber: 9,
        expectedTags: ["old"],
        tags: ["edge"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "permission-denied" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("maps floating IP API and application resource names independently", async () => {
    mocks.openstackRequest.mockResolvedValue(floatingIpPayload());

    await expect(
      updateNeutronResourceTagsAction(scope, "floating-ip", "floating-ip-a", {
        expectedRevisionNumber: 11,
        expectedTags: ["old"],
        tags: ["public"],
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2.0/floatingips/floating-ip-a",
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        actionLabel: "save floating IP tags",
        body: { tags: ["public"] },
        invalidates: [
          "/networking",
          "/networking/floating-ips",
          "/networking/floating-ips/floating-ip-a",
        ],
        path: "/v2.0/floatingips/floating-ip-a/tags",
        successMessage: "Floating IP tags saved.",
      }),
    );
  });

  it("reuses the guarded tag workflow for security groups", async () => {
    mocks.openstackRequest.mockResolvedValue(securityGroupPayload());

    await expect(
      updateNeutronResourceTagsAction(
        scope,
        "security-group",
        "security-group-a",
        {
          expectedRevisionNumber: 13,
          expectedTags: ["old"],
          tags: ["firewall:web"],
        },
      ),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v2.0/security-groups/security-group-a",
      }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        actionLabel: "save security group tags",
        body: { tags: ["firewall:web"] },
        invalidates: [
          "/networking",
          "/networking/security-groups",
          "/networking/security-groups/security-group-a",
        ],
        path: "/v2.0/security-groups/security-group-a/tags",
        successMessage: "Security group tags saved.",
      }),
    );
  });

  it("maps port payload and route names through the guarded tag workflow", async () => {
    mocks.openstackRequest.mockResolvedValue(portPayload());

    await expect(
      updateNeutronResourceTagsAction(scope, "port", "port-a", {
        expectedRevisionNumber: 15,
        expectedTags: ["old"],
        tags: ["interface:worker"],
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.openstackRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v2.0/ports/port-a" }),
    );
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        actionLabel: "save port tags",
        body: { tags: ["interface:worker"] },
        invalidates: [
          "/networking",
          "/networking/ports",
          "/networking/ports/port-a",
        ],
        path: "/v2.0/ports/port-a/tags",
        successMessage: "Port tags saved.",
      }),
    );
  });

  it("rejects unsupported resource kinds before authentication", async () => {
    await expect(
      updateNeutronResourceTagsAction(scope, "subnet", "subnet-a", {
        expectedTags: [],
        tags: ["new"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.guardMutationContext).not.toHaveBeenCalled();
  });

  it("rejects confirmed unsupported tagging before reading the network", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue(
      capabilities(["revision-if-match"]),
    );

    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedRevisionNumber: 7,
        expectedTags: ["old"],
        tags: ["new"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "service-unavailable" },
    });
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("allows inconclusive tag discovery", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue(capabilities());

    await updateNeutronResourceTagsAction(scope, "network", "network-a", {
      expectedRevisionNumber: 7,
      expectedTags: ["old"],
      tags: ["new"],
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.not.objectContaining({ headers: expect.anything() }),
    );
  });

  it("supports tag-only deployments without revision numbers", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue(
      capabilities(["standard-attr-tag"]),
    );
    mocks.openstackRequest.mockResolvedValue({
      network: {
        id: "network-a",
        project_id: "project-a",
        tags: ["old"],
      },
    });

    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedTags: ["old"],
        tags: ["new"],
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { tags: ["new"] },
        path: "/v2.0/networks/network-a/tags",
      }),
    );
  });

  it("allows reducing a legacy tag set above the modern Neutron limit", async () => {
    const legacyTags = Array.from(
      { length: 51 },
      (_, index) => `legacy-${index}`,
    );
    mocks.openstackRequest.mockResolvedValue(
      networkPayload({ tags: legacyTags }),
    );

    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedRevisionNumber: 7,
        expectedTags: legacyTags,
        tags: ["retained"],
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({ body: { tags: ["retained"] } }),
    );
  });

  it("rejects a stale tag draft without revision support", async () => {
    mocks.discoverNetworkCapabilities.mockResolvedValue(
      capabilities(["standard-attr-tag"]),
    );
    mocks.openstackRequest.mockResolvedValue({
      network: {
        id: "network-a",
        project_id: "project-a",
        tags: ["changed-elsewhere"],
      },
    });

    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedTags: ["old"],
        tags: ["new"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "conflict", status: 412 },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("requires advertised and returned revision data", async () => {
    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedTags: ["old"],
        tags: ["new"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });

    mocks.openstackRequest.mockResolvedValueOnce({
      network: {
        id: "network-a",
        project_id: "project-a",
        tags: ["old"],
      },
    });
    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedRevisionNumber: 7,
        expectedTags: ["old"],
        tags: ["new"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-response" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("blocks a shared network and a stale network revision", async () => {
    mocks.openstackRequest.mockResolvedValueOnce(
      networkPayload({ project_id: "project-b" }),
    );
    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedRevisionNumber: 7,
        expectedTags: ["old"],
        tags: ["new"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "permission-denied" },
    });

    mocks.openstackRequest.mockResolvedValueOnce(
      networkPayload({ revision_number: 8 }),
    );
    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedRevisionNumber: 7,
        expectedTags: ["old"],
        tags: ["new"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "conflict", status: 412 },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("avoids a replacement when only the tag order changed", async () => {
    mocks.openstackRequest.mockResolvedValue(
      networkPayload({ tags: ["one", "two"] }),
    );

    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedRevisionNumber: 7,
        expectedTags: ["one", "two"],
        tags: ["two", "one"],
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: ["one", "two"],
      message: "Network tags unchanged.",
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects invalid tags and malformed or missing networks", async () => {
    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedRevisionNumber: 7,
        expectedTags: ["old"],
        tags: ["duplicate", "duplicate"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });
    expect(mocks.guardMutationContext).not.toHaveBeenCalled();

    mocks.openstackRequest.mockResolvedValueOnce({ network: { id: "other" } });
    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedRevisionNumber: 7,
        expectedTags: ["old"],
        tags: ["new"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-response" },
    });

    mocks.openstackRequest.mockRejectedValueOnce(
      new OpenStackRequestError(404, "Not found"),
    );
    await expect(
      updateNeutronResourceTagsAction(scope, "network", "network-a", {
        expectedRevisionNumber: 7,
        expectedTags: ["old"],
        tags: ["new"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "not-found", status: 404 },
    });
  });
});
