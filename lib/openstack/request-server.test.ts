import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  isOpenStackNotFoundError,
  OpenStackRequestError,
} from "@/lib/openstack/request";
import { openstackRequest } from "@/lib/openstack/request-server";
import { metricsRegistry, resetMetricsForTests } from "@/lib/metrics";

describe("server-only OpenStack requests", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ keystoneProjectToken: "token" });
    mocks.getServiceEndpoint.mockResolvedValue(
      "https://compute.example.test/v2.1",
    );
  });

  afterEach(() => {
    resetMetricsForTests();
    vi.unstubAllEnvs();
  });

  it("keeps request paths on the trusted endpoint origin", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await openstackRequest({
      regionId: "RegionOne",
      serviceType: "compute",
      serviceName: "nova",
      path: "https://attacker.example/request?value=1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://compute.example.test/v2.1/request?value=1",
      expect.any(Object),
    );
  });

  it("uses a trusted server-provided endpoint override", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ credentials: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await openstackRequest({
      regionId: "",
      serviceType: "identity",
      serviceName: "keystone",
      endpointOverride: "https://identity.example.test/v3",
      path: "/users/user/application_credentials",
    });

    expect(mocks.getServiceEndpoint).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://identity.example.test/v3/users/user/application_credentials",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("records response body stream failures without counting success", async () => {
    vi.stubEnv("SUNRISE_METRICS_ENABLED", "true");
    resetMetricsForTests();
    const response = new Response(null, {
      status: 200,
      headers: { "x-openstack-request-id": "request-body-failed" },
    });
    vi.spyOn(response, "text").mockRejectedValue(
      new TypeError("response stream terminated"),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await openstackRequest({
      regionId: "RegionOne",
      serviceType: "compute",
      serviceName: "nova",
      path: "/servers/detail",
    });

    expect(result).toBeNull();
    const metrics = await metricsRegistry()!.metrics();
    expect(metrics).toContain(
      'sunrise_openstack_requests_total{method="GET",outcome="body_error",service_type="compute",status_code="200"} 1',
    );
    expect(metrics).not.toContain(
      'sunrise_openstack_requests_total{method="GET",outcome="success",service_type="compute",status_code="200"}',
    );
  });

  it("treats an intentionally empty response as successful", async () => {
    vi.stubEnv("SUNRISE_METRICS_ENABLED", "true");
    resetMetricsForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    const result = await openstackRequest({
      regionId: "RegionOne",
      serviceType: "compute",
      serviceName: "nova",
      path: "/servers/server-a/action",
      method: "POST",
    });

    expect(result).toBeNull();
    expect(await metricsRegistry()!.metrics()).toContain(
      'sunrise_openstack_requests_total{method="POST",outcome="success",service_type="compute",status_code="204"} 1',
    );
  });

  it("redirects a missing project token without logging an expected expiry", async () => {
    mocks.getSession.mockResolvedValue({});
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      openstackRequest({
        regionId: "RegionOne",
        serviceType: "compute",
        serviceName: "nova",
        path: "/servers/detail",
      }),
    ).rejects.toThrow("redirect:/auth/refresh");

    expect(consoleError).not.toHaveBeenCalled();
    expect(mocks.getServiceEndpoint).not.toHaveBeenCalled();
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

    const request = openstackRequest({
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
      openstackRequest({
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
