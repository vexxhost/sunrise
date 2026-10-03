import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseServicePolicy } from "@/lib/service-policy";

const mocks = vi.hoisted(() => ({
  getServicePolicy: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/deployment-config", () => ({
  getServicePolicy: mocks.getServicePolicy,
}));

import { unavailableServiceRouteResponse } from "@/lib/service-route-guard";

describe("service route availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServicePolicy.mockReturnValue(parseServicePolicy());
  });

  it("allows handlers to continue when the service is enabled", () => {
    expect(
      unavailableServiceRouteResponse("key-manager", "RegionOne"),
    ).toBeNull();
  });

  it("blocks globally disabled services", async () => {
    mocks.getServicePolicy.mockReturnValue(
      parseServicePolicy({ disabledServices: "key-manager" }),
    );

    const response = unavailableServiceRouteResponse(
      "key-manager",
      "RegionOne",
    );

    expect(response?.status).toBe(404);
    await expect(response?.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("disabled"),
    });
  });

  it("applies region-specific service policy", () => {
    mocks.getServicePolicy.mockReturnValue(
      parseServicePolicy({
        disabledServicesByRegion: JSON.stringify({
          RegionOne: ["image"],
        }),
      }),
    );

    expect(unavailableServiceRouteResponse("image", "RegionOne")?.status).toBe(
      404,
    );
    expect(unavailableServiceRouteResponse("image", "RegionTwo")).toBeNull();
  });
});
