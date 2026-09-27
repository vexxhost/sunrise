import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getServiceEndpoint: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/catalog", () => ({
  getServiceEndpoint: mocks.getServiceEndpoint,
}));

import { openstack } from "@/lib/openstack/actions";
import {
  isOpenStackNotFoundError,
  OpenStackRequestError,
} from "@/lib/openstack/request";

describe("openstack error handling", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ keystoneProjectToken: "token" });
    mocks.getServiceEndpoint.mockResolvedValue("https://compute.example.test");
  });

  it("throws a typed 404 without logging when detail recovery is enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 404, statusText: "Not Found" }),
        ),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const request = openstack({
      regionId: "RegionOne",
      serviceType: "compute",
      serviceName: "nova",
      path: "/servers/removed",
      errorMode: "throw",
    });

    const error = await request.catch((caught) => caught);

    expect(error).toBeInstanceOf(OpenStackRequestError);
    expect(isOpenStackNotFoundError(error)).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does not classify permission failures as missing resources", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 403, statusText: "Forbidden" }),
        ),
    );

    await expect(
      openstack({
        regionId: "RegionOne",
        serviceType: "compute",
        serviceName: "nova",
        path: "/servers/restricted",
        errorMode: "throw",
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OpenStackRequestError &&
        error.status === 403 &&
        !isOpenStackNotFoundError(error),
    );
  });

  it("recognizes a typed 404 after an error crosses a framework boundary", () => {
    expect(
      isOpenStackNotFoundError({
        name: "OpenStackRequestError",
        status: 404,
      }),
    ).toBe(true);
  });
});
