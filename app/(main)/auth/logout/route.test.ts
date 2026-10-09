import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.SUNRISE_DASHBOARD_URL = "https://sunrise.example.test";
  return {
    getSession: vi.fn(),
    destroySession: vi.fn((session: { destroy: () => void }) => {
      session.destroy();
      return Promise.resolve();
    }),
    destroySessionActivity: vi.fn(),
    buildEndSessionUrl: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
});

vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  destroySession: mocks.destroySession,
  destroySessionActivity: mocks.destroySessionActivity,
  SESSION_ACTIVITY_COOKIE_NAME: "sunrise-activity",
  SESSION_COOKIE_NAME: "sunrise",
}));
vi.mock("@/lib/oidc/sunrise", () => ({
  buildEndSessionUrl: mocks.buildEndSessionUrl,
  refreshAccessToken: mocks.refreshAccessToken,
}));

import { GET } from "./route";

function session() {
  return {
    keycloakRefreshToken: "refresh-token",
    federationIdentityProvider: "demo",
    oidcIdentity: { identityProvider: "demo" },
    destroy: vi.fn(),
  };
}

describe("Sunrise logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.destroySessionActivity.mockResolvedValue(undefined);
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
      identityProvider: "demo",
      postLogoutRedirectUri: "https://sunrise.example.test/",
      idTokenHint: "logout-id-token",
    });
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(
      "refresh-token",
      "demo",
    );
    expect(mocks.destroySession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshAccessToken.mock.invocationCallOrder[0],
    );
    expect(
      mocks.destroySessionActivity.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.refreshAccessToken.mock.invocationCallOrder[0]);
    expect(current.destroy).toHaveBeenCalledOnce();
    expect(mocks.getSession).toHaveBeenCalledWith({ allowExpired: true });
    expect(mocks.destroySessionActivity).toHaveBeenCalledOnce();
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("sunrise=");
    expect(cookies).toContain("sunrise-auth-prompt=select_account");
  });

  it("carries an expiry notice to the next login screen", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.refreshAccessToken.mockResolvedValue({ id_token: "logout-id-token" });
    mocks.buildEndSessionUrl.mockResolvedValue(null);

    const response = await GET(
      new Request("https://sunrise.example.test/auth/logout?reason=idle"),
    );

    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/auth/oidc/login?idp=demo",
    );
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.buildEndSessionUrl).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain(
      "sunrise-session-expiry=idle",
    );
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
