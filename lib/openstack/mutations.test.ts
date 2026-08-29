import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceEndpoint: vi.fn(),
  guardMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/catalog", () => ({
  getServiceEndpoint: mocks.getServiceEndpoint,
}));

import { executeOpenStackMutation } from "@/lib/openstack/mutations";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("OpenStack mutation executor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getServiceEndpoint.mockResolvedValue("https://nova.example/v2.1");
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: { projectToken: "token", scope },
    });
  });

  it("returns permission failures without exposing a service response body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"forbidden":{"message":"internal policy details"}}', {
        status: 403,
        headers: { "x-openstack-request-id": "request-123" },
      }),
    );

    const result = await executeOpenStackMutation({
      actionLabel: "delete this instance",
      method: "DELETE",
      path: "/servers/server-a",
      scope,
      serviceName: "nova",
      serviceType: "compute",
      successMessage: "Instance deletion requested.",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "permission-denied",
        message:
          "Your current role does not have permission to delete this instance.",
        requestId: "request-123",
      },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns transformed data and invalidates affected routes on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { server: { id: "server-a", name: "api" } },
        { status: 202 },
      ),
    );

    const result = await executeOpenStackMutation<{ id: string }>({
      actionLabel: "launch an instance",
      body: { server: { name: "api" } },
      invalidates: ["/compute", "/compute/instances", "/compute"],
      method: "POST",
      path: "/servers",
      scope,
      serviceName: "nova",
      serviceType: "compute",
      successMessage: "Instance api is being created.",
      transform: (payload) => (payload as { server: { id: string } }).server,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { id: "server-a" },
      scope,
      status: "success",
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/compute"],
      ["/compute/instances"],
    ]);
  });

  it("does not contact a service when the rendered context is stale", async () => {
    mocks.guardMutationContext.mockResolvedValue({
      ok: false,
      result: {
        ok: false,
        status: "error",
        error: {
          code: "context-changed",
          message: "The active project changed.",
          retryable: true,
        },
        scope,
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await executeOpenStackMutation({
      actionLabel: "launch an instance",
      method: "POST",
      path: "/servers",
      scope,
      serviceName: "nova",
      serviceType: "compute",
      successMessage: "Instance is being created.",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "context-changed" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.getServiceEndpoint).not.toHaveBeenCalled();
  });
});
