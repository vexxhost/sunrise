import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectScopedTokenContext: vi.fn(),
  getSession: vi.fn(),
  redirect: vi.fn(),
  saveRedisSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/session-store", () => ({
  saveRedisSession: mocks.saveRedisSession,
}));
vi.mock("@/lib/keystone/login", () => ({
  getProjectScopedTokenContext: mocks.getProjectScopedTokenContext,
}));

import { getProjects, getRegions } from "@/lib/keystone/queries";

function session() {
  return {
    keystone_unscoped_token: "unscoped-token",
    keycloakRefreshToken: "refresh-token-1",
    oidcSessionGeneration: "generation-1",
    federationIdentityProvider: "demo",
    save: vi.fn(),
  };
}

describe("Keystone context queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("KEYSTONE_API", "https://identity.example.test");
    mocks.getProjectScopedTokenContext.mockResolvedValue({
      value: "project-token",
      roles: [{ id: "member-id", name: "member" }],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          projects: [{ id: "project-1", name: "Project One" }],
        }),
      ),
    );
  });

  it("does not persist automatic project selection over a continuation", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.saveRedisSession.mockImplementation(async (_active, options) => {
      options.validateConflictRetry({
        ...current,
        keycloakRefreshToken: "refresh-token-2",
        oidcSessionGeneration: "generation-2",
      });
    });

    await expect(getProjects()).resolves.toEqual([]);
    expect(current.save).not.toHaveBeenCalled();
  });

  it("does not replace a concurrently selected project with the default", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    mocks.saveRedisSession.mockImplementation(async (_active, options) => {
      options.validateConflictRetry({
        ...current,
        projectId: "project-2",
      });
    });

    await expect(getProjects()).resolves.toEqual([]);
    expect(current.save).not.toHaveBeenCalled();
  });

  it("does not replace a concurrently selected region with the default", async () => {
    const current = session();
    mocks.getSession.mockResolvedValue(current);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          regions: [{ id: "RegionOne", description: "Primary region" }],
        }),
      ),
    );
    mocks.saveRedisSession.mockImplementation(async (_active, options) => {
      options.validateConflictRetry({
        ...current,
        regionId: "RegionTwo",
      });
    });

    await expect(getRegions()).resolves.toEqual([]);
    expect(current.save).not.toHaveBeenCalled();
  });
});
