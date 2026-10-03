import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceCatalog: vi.fn(),
  guardMutationContext: vi.fn(),
  revalidatePath: vi.fn(),
  resolveServiceEndpoint: vi.fn(),
  unavailableServiceRouteResponse: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));
vi.mock("@/lib/openstack/catalog", () => ({
  getServiceCatalog: mocks.getServiceCatalog,
  resolveServiceEndpoint: mocks.resolveServiceEndpoint,
}));
vi.mock("@/lib/service-route-guard", () => ({
  unavailableServiceRouteResponse: mocks.unavailableServiceRouteResponse,
}));

import { POST } from "./route";

describe("Glance image upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: {
        projectToken: "token",
        scope: { projectId: "project-a", regionId: "RegionOne" },
      },
    });
    mocks.unavailableServiceRouteResponse.mockReturnValue(null);
  });

  it("does not upload image data when Glance is disabled", async () => {
    mocks.unavailableServiceRouteResponse.mockReturnValue(
      Response.json({ error: "Service disabled" }, { status: 404 }),
    );
    const request = new Request(
      "http://localhost/compute/images/image-a/upload",
      {
        method: "POST",
        headers: {
          "Content-Length": "4",
          "X-Sunrise-Project-Id": "project-a",
          "X-Sunrise-Region-Id": "RegionOne",
        },
        body: "test",
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: "image-a" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.getServiceCatalog).not.toHaveBeenCalled();
  });
});
