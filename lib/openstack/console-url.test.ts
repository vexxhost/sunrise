import { describe, expect, it } from "vitest";

import { toNoVncWebSocketUrl } from "@/lib/openstack/console-url";

describe("noVNC WebSocket URLs", () => {
  it("uses Nova's path parameter and preserves its token", () => {
    expect(
      toNoVncWebSocketUrl(
        "https://console.example/vnc_lite.html?path=websockify%3Ftoken%3Dsecret",
      ),
    ).toBe("wss://console.example/websockify?token=secret");
  });

  it("matches noVNC behavior when Nova supplies only the token path", () => {
    expect(
      toNoVncWebSocketUrl(
        "https://console.example/vnc_lite.html?path=%3Ftoken%3Dsecret",
      ),
    ).toBe("wss://console.example/vnc_lite.html?token=secret");
  });

  it("defaults to websockify relative to the console page", () => {
    expect(
      toNoVncWebSocketUrl(
        "https://console.example/novnc/vnc_lite.html?token=secret",
      ),
    ).toBe("wss://console.example/novnc/websockify");
  });

  it("supports explicit noVNC hosts and ports", () => {
    expect(
      toNoVncWebSocketUrl(
        "http://console.example/vnc_lite.html?host=proxy.example&port=6080&path=socket%3Ftoken%3Dsecret",
      ),
    ).toBe("ws://proxy.example:6080/socket?token=secret");
  });

  it("rejects malformed and unsupported console page URLs", () => {
    expect(() => toNoVncWebSocketUrl("not a URL")).toThrow();
    expect(() =>
      toNoVncWebSocketUrl("ftp://console.example/vnc_lite.html"),
    ).toThrow("Nova returned an unsupported VNC console URL");
  });
});
