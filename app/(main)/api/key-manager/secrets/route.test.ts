import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createBarbicanSecret: vi.fn(),
  unavailableServiceRouteResponse: vi.fn(),
}));

vi.mock("@/lib/openstack/barbican-secret-mutation", () => ({
  createBarbicanSecret: mocks.createBarbicanSecret,
}));
vi.mock("@/lib/service-route-guard", () => ({
  unavailableServiceRouteResponse: mocks.unavailableServiceRouteResponse,
}));

import { POST } from "./route";

function createRequest() {
  return new NextRequest("http://localhost/api/key-manager/secrets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
    },
    body: JSON.stringify({
      scope: { projectId: "project-a", regionId: "RegionOne" },
      input: { name: "test-secret" },
    }),
  });
}

describe("Barbican secret creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unavailableServiceRouteResponse.mockReturnValue(null);
    mocks.createBarbicanSecret.mockResolvedValue({
      ok: true,
      status: "success",
      data: { secretId: "secret-a" },
      message: "Secret created.",
      scope: { projectId: "project-a", regionId: "RegionOne" },
    });
  });

  it("does not create secrets when Key Manager is disabled", async () => {
    mocks.unavailableServiceRouteResponse.mockReturnValue(
      Response.json({ error: "Service disabled" }, { status: 404 }),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(404);
    expect(mocks.createBarbicanSecret).not.toHaveBeenCalled();
  });
});
