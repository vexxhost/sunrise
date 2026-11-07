import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  openstackRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/openstack/request-server", () => ({
  openstackRequest: mocks.openstackRequest,
}));

import { getRemoteConsoleAction } from "@/lib/openstack/console-actions";

describe("remote console actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ regionId: "RegionOne" });
    mocks.openstackRequest.mockResolvedValue({
      remote_console: {
        protocol: "vnc",
        type: "novnc",
        url: "https://console.example.test/vnc_lite.html?token=secret",
      },
    });
  });

  it("returns Nova's console URL without coupling it to dashboard assets", async () => {
    const remote = await getRemoteConsoleAction("server-1");
    expect(remote.url).toBe(
      "https://console.example.test/vnc_lite.html?token=secret",
    );
    expect(remote.rawUrl).toBe(
      "https://console.example.test/vnc_lite.html?token=secret",
    );
  });
});
