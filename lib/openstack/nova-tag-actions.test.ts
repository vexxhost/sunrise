import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeOpenStackMutation: vi.fn(),
  guardMutationContext: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/mutations", () => ({
  executeOpenStackMutation: mocks.executeOpenStackMutation,
}));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));

import { updateServerTagsAction } from "@/lib/openstack/nova-tag-actions";

const scope = { projectId: "project-a", regionId: "RegionOne" };

function serverPayload(overrides: Record<string, unknown> = {}) {
  return {
    server: {
      id: "server-a",
      tenant_id: "project-a",
      tags: ["old"],
      ...overrides,
    },
  };
}

describe("Nova server tag mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { projectToken: "token", scope },
    });
    mocks.openstackRequest.mockResolvedValue(serverPayload());
    mocks.executeOpenStackMutation.mockResolvedValue({
      ok: true,
      status: "success",
      data: ["env:test", "team:cloud"],
      message: "Instance tags saved.",
      scope,
    });
  });

  it("revalidates ownership and replaces the complete exact tag set", async () => {
    await expect(
      updateServerTagsAction(scope, "server-a", {
        expectedTags: ["old"],
        tags: ["env:test", "team:cloud"],
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.openstackRequest).toHaveBeenCalledWith({
      regionId: "RegionOne",
      serviceType: "compute",
      serviceName: "nova",
      path: "/servers/server-a",
      apiVersion: "compute 2.79",
      errorMode: "throw",
    });
    expect(mocks.executeOpenStackMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        actionLabel: "save instance tags",
        apiVersion: "compute 2.79",
        body: { tags: ["env:test", "team:cloud"] },
        method: "PUT",
        path: "/servers/server-a/tags",
        scope,
        invalidates: [
          "/compute",
          "/compute/instances",
          "/compute/instances/server-a",
        ],
        successMessage: "Instance tags saved.",
      }),
    );
  });

  it("accepts only a matching saved tag response", async () => {
    await updateServerTagsAction(scope, "server-a", {
      expectedTags: ["old"],
      tags: ["env:test", "team:cloud"],
    });
    const options = mocks.executeOpenStackMutation.mock.calls[0]?.[0];

    expect(options.transform({ tags: ["team:cloud", "env:test"] })).toEqual([
      "team:cloud",
      "env:test",
    ]);
    expect(() => options.transform({ tags: ["env:test"] })).toThrow(
      "unexpected instance tags",
    );
    expect(() =>
      options.transform({ tags: ["env:test", "env:test"] }),
    ).toThrow("unexpected instance tags");
  });

  it("accepts equivalent hyphenated project identifiers", async () => {
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: {
        projectToken: "token",
        scope: {
          projectId: "297c1aa4-ef4f-42bf-9fdb-6a7c6ced78b2",
          regionId: "RegionOne",
        },
      },
    });
    mocks.openstackRequest.mockResolvedValue(
      serverPayload({ tenant_id: "297c1aa4ef4f42bf9fdb6a7c6ced78b2" }),
    );

    await updateServerTagsAction(scope, "server-a", {
      expectedTags: ["old"],
      tags: ["env:test"],
    });

    expect(mocks.executeOpenStackMutation).toHaveBeenCalledTimes(1);
  });

  it("returns success without writing when the tag set is unchanged", async () => {
    await expect(
      updateServerTagsAction(scope, "server-a", {
        expectedTags: ["old"],
        tags: ["old"],
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: ["old"],
      message: "Instance tags unchanged.",
    });

    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects a stale editor before replacing tags", async () => {
    mocks.openstackRequest.mockResolvedValue(
      serverPayload({ tags: ["changed-elsewhere"] }),
    );

    await expect(
      updateServerTagsAction(scope, "server-a", {
        expectedTags: ["old"],
        tags: ["env:test"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("rejects instances outside the active project", async () => {
    mocks.openstackRequest.mockResolvedValue(
      serverPayload({ tenant_id: "project-b" }),
    );

    await expect(
      updateServerTagsAction(scope, "server-a", {
        expectedTags: ["old"],
        tags: ["env:test"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "permission-denied" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("fails closed when Nova omits ownership or tags", async () => {
    mocks.openstackRequest.mockResolvedValue(serverPayload({ tags: undefined }));

    await expect(
      updateServerTagsAction(scope, "server-a", {
        expectedTags: ["old"],
        tags: ["env:test"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-response" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("fails closed when Nova returns a different instance", async () => {
    mocks.openstackRequest.mockResolvedValue(
      serverPayload({ id: "server-b" }),
    );

    await expect(
      updateServerTagsAction(scope, "server-a", {
        expectedTags: ["old"],
        tags: ["env:test"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid-response" },
    });
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("stops before reading when the active scope no longer matches", async () => {
    mocks.guardMutationContext.mockResolvedValue({
      ok: false,
      result: {
        ok: false,
        status: "error",
        error: {
          code: "scope-changed",
          message: "The active project changed.",
          retryable: false,
        },
        scope,
      },
    });

    await expect(
      updateServerTagsAction(scope, "server-a", {
        expectedTags: ["old"],
        tags: ["env:test"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "scope-changed" },
    });
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
    expect(mocks.executeOpenStackMutation).not.toHaveBeenCalled();
  });

  it("validates tag syntax before reading the instance", async () => {
    await expect(
      updateServerTagsAction(scope, "server-a", {
        expectedTags: ["old"],
        tags: ["not/valid"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed" },
    });

    expect(mocks.guardMutationContext).not.toHaveBeenCalled();
    expect(mocks.openstackRequest).not.toHaveBeenCalled();
  });
});
