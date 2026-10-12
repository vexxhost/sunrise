import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));

import { getRemoteConsoleAction } from "@/lib/openstack/console-actions";

describe("remote console actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUNRISE_DASHBOARD_URL = "http://localhost:9090";
    mocks.getSession.mockResolvedValue({ regionId: "RegionOne" });
    mocks.headers.mockResolvedValue(new Headers({ host: "localhost:9091" }));
    mocks.openstackRequest.mockResolvedValue({
      remote_console: {
        protocol: "vnc",
        type: "novnc",
        url: "https://console.example.test/vnc_lite.html?token=secret",
      },
    });
  });

  it("binds the noVNC bridge to the replica serving the request", async () => {
    const remote = await getRemoteConsoleAction("server-1");
    const url = new URL(remote.url);

    expect(url.pathname).toBe("/sunrise.html");
    expect(url.searchParams.get("token")).toBe("secret");
    expect(url.searchParams.get("parentOrigin")).toBe(
      "http://localhost:9091",
    );
    expect(remote.rawUrl).toBe(
      "https://console.example.test/vnc_lite.html?token=secret",
    );
  });
});
