import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.SUNRISE_DASHBOARD_URL = "https://sunrise.example.test";
  return {
    getSession: vi.fn(),
    refreshKeystoneSession: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/keystone/renewal", () => ({
  refreshKeystoneSession: mocks.refreshKeystoneSession,
}));

import { GET } from "./route";
import { OidcSessionSupersededError } from "@/lib/oidc/session-authority";

function session(): {
  oidcIdentity: { identityProvider: string };
  authRecovery?: { reason: "session-unavailable" };
  save: ReturnType<typeof vi.fn>;
} {
  return {
    oidcIdentity: { identityProvider: "demo" },
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Keystone auth refresh route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("returns to the exact page after silent renewal", async () => {
    mocks.getSession.mockResolvedValue(session());
    mocks.refreshKeystoneSession.mockResolvedValue("ready");

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/refresh?returnTo=%2Fcompute%2Finstances%3Ffilter%3Dactive",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/compute/instances?filter=active",
    );
  });

  it("uses the existing provider session when the refresh token expired", async () => {
    mocks.getSession.mockResolvedValue(session());
    mocks.refreshKeystoneSession.mockResolvedValue("reauthenticate");

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/refresh?returnTo=%2Fkubernetes%2Fclusters",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/auth/oidc/login?idp=demo&returnTo=%2Fkubernetes%2Fclusters&continuation=1",
    );
  });

  it("uses the persisted provider when OIDC identity enrichment is unavailable", async () => {
    mocks.getSession.mockResolvedValue({
      ...session(),
      federationIdentityProvider: "atmosphere",
      oidcIdentity: undefined,
    });
    mocks.refreshKeystoneSession.mockResolvedValue("reauthenticate");

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/refresh?returnTo=%2Fobject-storage%2Fbuckets",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/auth/oidc/login?idp=atmosphere&returnTo=%2Fobject-storage%2Fbuckets&continuation=1",
    );
  });

  it("does not renew an expired Sunrise session", async () => {
    mocks.getSession.mockResolvedValue({
      ...session(),
      sessionExpiryReason: "absolute",
    });

    const response = await GET(
      new Request("https://sunrise.example.test/auth/refresh"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(mocks.refreshKeystoneSession).not.toHaveBeenCalled();
  });

  it("keeps no-project sessions in the signed-in recovery view", async () => {
    mocks.getSession.mockResolvedValue(session());
    mocks.refreshKeystoneSession.mockResolvedValue("no-projects");

    const response = await GET(
      new Request("https://sunrise.example.test/auth/refresh"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
  });

  it("shows recovery instead of looping when Keystone is unavailable", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.refreshKeystoneSession.mockRejectedValue(new Error("Keystone down"));

    const response = await GET(
      new Request("https://sunrise.example.test/auth/refresh"),
    );

    expect(response.status).toBe(303);
    expect(current.authRecovery).toEqual({ reason: "session-unavailable" });
    expect(current.save).toHaveBeenCalledOnce();
  });

  it("does not save stale recovery state after a completed continuation", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.refreshKeystoneSession.mockRejectedValue(
      new OidcSessionSupersededError(),
    );

    const response = await GET(
      new Request("https://sunrise.example.test/auth/refresh"),
    );

    expect(response.status).toBe(303);
    expect(current.authRecovery).toBeUndefined();
    expect(current.save).not.toHaveBeenCalled();
  });
});
