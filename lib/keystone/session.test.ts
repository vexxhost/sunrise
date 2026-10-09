import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getProjectScopedTokenContext: vi.fn(),
  saveRedisSession: vi.fn(),
}));

vi.mock("@/lib/keystone/login", () => ({
  getProjectScopedTokenContext: mocks.getProjectScopedTokenContext,
}));
vi.mock("@/lib/session-store", () => ({
  saveRedisSession: mocks.saveRedisSession,
}));

describe("Keystone session validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("KEYSTONE_API", "https://identity.example.test");
    mocks.getProjectScopedTokenContext.mockReset();
    mocks.saveRedisSession.mockImplementation(async (current) =>
      current.save(),
    );
  });

  it("backfills project roles for a session created before role metadata existed", async () => {
    const save = vi.fn();
    const session = {
      keystone_unscoped_token: "unscoped-token",
      keystoneProjectToken: "existing-project-token",
      projectId: "project-id",
      save,
    };
    mocks.getProjectScopedTokenContext.mockResolvedValue({
      value: "refreshed-project-token",
      roles: [
        { id: "member-id", name: "member" },
        { id: "reader-id", name: "reader" },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const { getKeystoneSessionState } = await import("@/lib/keystone/session");

    await expect(
      getKeystoneSessionState(
        session as unknown as Parameters<typeof getKeystoneSessionState>[0],
      ),
    ).resolves.toEqual({ status: "valid" });
    expect(mocks.getProjectScopedTokenContext).toHaveBeenCalledWith(
      "unscoped-token",
      "project-id",
    );
    expect(session).toMatchObject({
      keystoneProjectToken: "refreshed-project-token",
      keystoneProjectRoles: [
        { id: "member-id", name: "member" },
        { id: "reader-id", name: "reader" },
      ],
    });
    expect(save).toHaveBeenCalledOnce();
  });

  it("does not persist token repairs over a completed continuation", async () => {
    const session = {
      keystone_unscoped_token: "unscoped-token",
      keystoneProjectToken: "existing-project-token",
      projectId: "project-id",
      keycloakRefreshToken: "refresh-token-1",
      oidcSessionGeneration: "generation-1",
      federationIdentityProvider: "demo",
      save: vi.fn(),
    };
    mocks.getProjectScopedTokenContext.mockResolvedValue({
      value: "refreshed-project-token",
      roles: [{ id: "member-id", name: "member" }],
    });
    mocks.saveRedisSession.mockImplementation(async (_current, options) => {
      options.validateConflictRetry({
        ...session,
        keycloakRefreshToken: "refresh-token-2",
        oidcSessionGeneration: "generation-2",
      });
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const { getKeystoneSessionState } = await import("@/lib/keystone/session");

    await expect(
      getKeystoneSessionState(
        session as unknown as Parameters<typeof getKeystoneSessionState>[0],
      ),
    ).resolves.toEqual({
      status: "unknown",
      reason: "OIDC session changed during Keystone validation",
    });
    expect(session.save).not.toHaveBeenCalled();
  });
});
