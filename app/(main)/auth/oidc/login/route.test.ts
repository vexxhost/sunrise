import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS = "demo";
  return {
    buildAuthorizeUrl: vi.fn(),
    generatePkce: vi.fn(),
    generateState: vi.fn(),
    getSession: vi.fn(),
    saveRedisSession: vi.fn(),
  };
});

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/session-store", () => ({
  saveRedisSession: mocks.saveRedisSession,
}));
vi.mock("@/lib/oidc/sunrise", () => ({
  buildAuthorizeUrl: mocks.buildAuthorizeUrl,
  generatePkce: mocks.generatePkce,
  generateState: mocks.generateState,
}));

import { GET } from "./route";
import { StoredSessionSupersededError } from "@/lib/session-errors";

describe("OIDC login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generatePkce.mockReturnValue({
      verifier: "pkce-verifier",
      challenge: "pkce-challenge",
    });
    mocks.generateState.mockReturnValue("oidc-state");
    mocks.buildAuthorizeUrl.mockResolvedValue(
      "https://identity.example.test/authorize",
    );
    mocks.saveRedisSession.mockImplementation((session) => session.save());
  });

  it("forwards the account-selection prompt and clears its one-shot cookie", async () => {
    const session = { save: vi.fn().mockResolvedValue(undefined) };
    mocks.getSession.mockResolvedValue(session);

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/login?idp=demo&prompt=select_account&returnTo=%2Fobject-storage%2Fbuckets",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://identity.example.test/authorize",
    );
    expect(mocks.buildAuthorizeUrl).toHaveBeenCalledWith({
      identityProvider: "demo",
      challenge: "pkce-challenge",
      state: "oidc-state",
      prompt: "select_account",
    });
    expect(session).toMatchObject({
      oidcVerifier: "pkce-verifier",
      oidcState: "oidc-state",
      oidcFlowId: expect.any(String),
      oidcIdProvider: "demo",
      oidcReturnTo: "/object-storage/buckets",
    });
    expect(session.save).toHaveBeenCalledOnce();
    expect(mocks.saveRedisSession).toHaveBeenCalledWith(session, {
      recoverRotatedSession: true,
    });
    expect(response.headers.get("set-cookie")).toContain(
      "sunrise-auth-prompt=",
    );
  });

  it("marks interactive child-token renewal as a session continuation", async () => {
    const session = { save: vi.fn().mockResolvedValue(undefined) };
    mocks.getSession.mockResolvedValue(session);

    await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/login?idp=demo&continuation=1",
      ),
    );

    expect(session).toMatchObject({ oidcSessionContinuation: true });
  });

  it("does not continue token renewal after Sunrise expires", async () => {
    const session = {
      sessionExpiryReason: "idle",
      save: vi.fn().mockResolvedValue(undefined),
    };
    mocks.getSession.mockResolvedValue(session);

    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/login?idp=demo&continuation=1",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(session.save).not.toHaveBeenCalled();
    expect(mocks.buildAuthorizeUrl).not.toHaveBeenCalled();
  });

  it("returns to Sunrise when a concurrent callback supersedes login", async () => {
    const session = { save: vi.fn().mockResolvedValue(undefined) };
    mocks.getSession.mockResolvedValue(session);
    mocks.saveRedisSession.mockRejectedValueOnce(
      new StoredSessionSupersededError("Concurrent callback won"),
    );

    const response = await GET(
      new Request("https://sunrise.example.test/auth/oidc/login?idp=demo"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/",
    );
    expect(mocks.buildAuthorizeUrl).not.toHaveBeenCalled();
  });

  it("rejects providers that are not configured", async () => {
    const response = await GET(
      new Request(
        "https://sunrise.example.test/auth/oidc/login?idp=unknown&prompt=login",
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.buildAuthorizeUrl).not.toHaveBeenCalled();
  });
});
