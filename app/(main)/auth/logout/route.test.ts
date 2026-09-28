import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.DASHBOARD_URL = "https://sunrise.example.test";
  return {
    getSession: vi.fn(),
    buildEndSessionUrl: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
});

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/oidc/sunrise", () => ({
  buildEndSessionUrl: mocks.buildEndSessionUrl,
  refreshAccessToken: mocks.refreshAccessToken,
}));

import { GET } from "./route";

function session() {
  return {
    keycloakRefreshToken: "refresh-token",
    destroy: vi.fn(),
  };
}

describe("Sunrise logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("ends the provider session and clears the local session", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.refreshAccessToken.mockResolvedValue({ id_token: "logout-id-token" });
    mocks.buildEndSessionUrl.mockResolvedValue(
      "https://identity.example.test/logout?client_id=sunrise-server",
    );

    const response = await GET(
      new Request("https://sunrise.example.test/auth/logout?mode=switch"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://identity.example.test/logout?client_id=sunrise-server",
    );
    expect(mocks.buildEndSessionUrl).toHaveBeenCalledWith({
      postLogoutRedirectUri: "https://sunrise.example.test/",
      idTokenHint: "logout-id-token",
    });
    expect(current.destroy).toHaveBeenCalledOnce();
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("sunrise=");
    expect(cookies).toContain("sunrise-auth-prompt=select_account");
  });

  it("still signs out locally when provider discovery is unavailable", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.refreshAccessToken.mockRejectedValue(new Error("refresh failed"));
    mocks.buildEndSessionUrl.mockRejectedValue(new Error("discovery failed"));

    const response = await GET(
      new Request("https://sunrise.example.test/auth/logout"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(current.destroy).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toContain(
      "sunrise-auth-prompt=login",
    );
  });
});
