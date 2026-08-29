import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceCatalog: vi.fn(),
  guardMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
  resolveServiceEndpoint: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/catalog", () => ({
  getServiceCatalog: mocks.getServiceCatalog,
  resolveServiceEndpoint: mocks.resolveServiceEndpoint,
}));

import { executeOpenStackMutation } from "@/lib/openstack/mutations";

const scope = { projectId: "project-a", regionId: "RegionOne" };

describe("OpenStack mutation executor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getServiceCatalog.mockResolvedValue([]);
    mocks.resolveServiceEndpoint.mockReturnValue(
      "https://nova.example/v2.1",
    );
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
    expect(mocks.getServiceCatalog).not.toHaveBeenCalled();
    expect(mocks.resolveServiceEndpoint).not.toHaveBeenCalled();
  });

  it("returns a retryable error when service discovery fails", async () => {
    mocks.getServiceCatalog.mockResolvedValue(null);
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
      error: {
        code: "service-error",
        message:
          "Cloud service discovery is temporarily unavailable. Try again shortly.",
        retryable: true,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.resolveServiceEndpoint).not.toHaveBeenCalled();
  });

  it("reports a genuinely absent endpoint as non-retryable", async () => {
    mocks.resolveServiceEndpoint.mockReturnValue(null);
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
      error: {
        code: "service-unavailable",
        message: "nova is not available in RegionOne.",
        retryable: false,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
