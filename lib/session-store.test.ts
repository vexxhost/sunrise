import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIronSession: vi.fn(),
  runRedisCommand: vi.fn(),
}));

vi.mock("iron-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("iron-session")>()),
  getIronSession: mocks.getIronSession,
}));

vi.mock("@/lib/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/redis")>()),
  runRedisCommand: mocks.runRedisCommand,
}));

import {
  destroyRedisSession,
  getRedisSession,
  mergeStoredSession,
  reloadRedisSession,
  rotateRedisSession,
  saveRedisSession,
  storedSessionTtlSeconds,
} from "@/lib/session-store";
import { sealData } from "iron-session";
import type { SunriseSession } from "@/lib/session";

const originalIdleTimeout = process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS;
const originalAbsoluteTimeout =
  process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS;
const originalSessionSecret = process.env.SUNRISE_SESSION_SECRET;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUNRISE_SESSION_SECRET =
    "test-session-secret-that-is-at-least-thirty-two-characters";
});

afterEach(() => {
  restoreEnvironment(
    "SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS",
    originalIdleTimeout,
  );
  restoreEnvironment(
    "SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS",
    originalAbsoluteTimeout,
  );
  restoreEnvironment("SUNRISE_SESSION_SECRET", originalSessionSecret);
});

describe("Redis session storage", () => {
  it("merges only fields changed by a concurrent request", () => {
    const current: SunriseSession = {
      projectId: "project-newer",
      regionId: "RegionOne",
      keystoneProjectToken: "token-current",
    };
    const requestSnapshot: SunriseSession = {
      projectId: "project-older",
      regionId: "RegionTwo",
      keystoneProjectToken: undefined,
    };

    expect(
      mergeStoredSession(
        current,
        requestSnapshot,
        new Set(["regionId", "keystoneProjectToken"]),
        new Set(["keystoneProjectToken"]),
      ),
    ).toEqual({
      projectId: "project-newer",
      regionId: "RegionTwo",
    });
  });

  it("bounds stored data by the absolute session lifetime", () => {
    process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = "60";
    process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS = "600";
    const now = 1_000_000;

    expect(
      storedSessionTtlSeconds({ sessionSignedInAt: now - 125_000 }, now),
    ).toBe(475);
    expect(storedSessionTtlSeconds({}, now)).toBe(600);
    expect(
      storedSessionTtlSeconds({ sessionSignedInAt: now - 700_000 }, now),
    ).toBe(1);
  });

  it("keeps abandoned pre-authentication sessions short-lived", () => {
    process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = "600";
    process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS = "3600";

    expect(storedSessionTtlSeconds({})).toBe(600);
  });

  it("migrates a legacy chunk-capable cookie to an opaque reference", async () => {
    const saveReference = vi.fn();
    const reference = {
      projectId: "legacy-project",
      keycloakRefreshToken: "legacy-refresh-token",
    };
    Object.defineProperties(reference, {
      save: { value: saveReference },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const client = {
      eval: vi.fn().mockResolvedValue(1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession(
      {} as never,
      { chunk: true } as never,
    );
    expect(session).toMatchObject({
      projectId: "legacy-project",
      keycloakRefreshToken: "legacy-refresh-token",
    });

    await session.save();

    expect(mocks.getIronSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ chunk: true }),
    );
    expect(reference).toEqual(
      expect.objectContaining({ backend: "redis", key: expect.any(String) }),
    );
    expect(reference).not.toHaveProperty("projectId");
    expect(reference).not.toHaveProperty("keycloakRefreshToken");
    expect(saveReference).toHaveBeenCalledOnce();
  });

  it("rotates a referenced session ID when its Redis record is gone", async () => {
    const saveReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "expired-session-id",
      projectId: "stale-project",
    };
    Object.defineProperties(reference, {
      save: { value: saveReference },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const client = {
      hGetAll: vi.fn().mockResolvedValue({}),
      eval: vi.fn().mockResolvedValue(1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    expect(session.projectId).toBeUndefined();
    session.projectId = "project-new";
    await session.save();

    const saveOptions = client.eval.mock.calls[0][1] as {
      keys: string[];
    };
    expect(saveOptions.keys[0]).not.toContain("expired-session-id");
    expect(reference.key).not.toBe("expired-session-id");
    expect(reference.backend).toBe("redis");
    expect(saveReference).toHaveBeenCalledOnce();
  });

  it("rejects a save when its record disappears after a CAS conflict", async () => {
    const saveReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "evicted-during-save",
    };
    Object.defineProperties(reference, {
      save: { value: saveReference },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const sealed = await sealData(
      { projectId: "project-old", sessionSignedInAt: Date.now() },
      {
        password: process.env.SUNRISE_SESSION_SECRET!,
        ttl: 3600,
      },
    );
    const client = {
      hGetAll: vi
        .fn()
        .mockResolvedValueOnce({ version: "1", data: sealed })
        .mockResolvedValueOnce({}),
      eval: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    session.projectId = "project-new";
    await expect(session.save()).rejects.toThrow(
      "Cannot save a missing or revoked Sunrise session",
    );

    const firstSave = client.eval.mock.calls[0][1] as { keys: string[] };
    expect(firstSave.keys[0]).toContain("evicted-during-save");
    expect(client.eval).toHaveBeenCalledOnce();
    expect(reference.key).toBe("evicted-during-save");
    expect(saveReference).not.toHaveBeenCalled();
  });

  it("reloads remote fields while preserving unsaved request changes", async () => {
    const reference = {
      backend: "redis",
      key: "shared-session-id",
    };
    Object.defineProperties(reference, {
      save: { value: vi.fn() },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const initial = await sealData(
      { projectId: "project-old", regionId: "RegionOne" },
      {
        password: process.env.SUNRISE_SESSION_SECRET!,
        ttl: 3600,
      },
    );
    const refreshed = await sealData(
      {
        projectId: "project-new",
        regionId: "RegionOne",
        keycloakRefreshToken: "rotated-token",
      },
      {
        password: process.env.SUNRISE_SESSION_SECRET!,
        ttl: 3600,
      },
    );
    const client = {
      hGetAll: vi
        .fn()
        .mockResolvedValueOnce({ version: "1", data: initial })
        .mockResolvedValueOnce({ version: "2", data: refreshed }),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    session.regionId = "RegionTwo";
    await reloadRedisSession(session);

    expect(session).toMatchObject({
      projectId: "project-new",
      regionId: "RegionTwo",
      keycloakRefreshToken: "rotated-token",
    });
  });

  it("exposes fields merged from a concurrent save", async () => {
    const beforeConflictRetry = vi.fn().mockResolvedValue(undefined);
    const reference = {
      backend: "redis",
      key: "concurrent-session-id",
    };
    Object.defineProperties(reference, {
      save: { value: vi.fn() },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const initial = await sealData(
      { projectId: "project-old", regionId: "RegionOne" },
      {
        password: process.env.SUNRISE_SESSION_SECRET!,
        ttl: 3600,
      },
    );
    const concurrent = await sealData(
      { projectId: "project-new", regionId: "RegionOne" },
      {
        password: process.env.SUNRISE_SESSION_SECRET!,
        ttl: 3600,
      },
    );
    const client = {
      hGetAll: vi
        .fn()
        .mockResolvedValueOnce({ version: "1", data: initial })
        .mockResolvedValueOnce({ version: "2", data: concurrent }),
      eval: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    session.regionId = "RegionTwo";
    await saveRedisSession(session, {
      beforeConflictRetry,
      maximumCommandTimeoutMs: 2_000,
    });

    expect(session).toMatchObject({
      projectId: "project-new",
      regionId: "RegionTwo",
    });
    expect(beforeConflictRetry).toHaveBeenCalledOnce();
    expect(beforeConflictRetry.mock.invocationCallOrder[0]).toBeLessThan(
      client.hGetAll.mock.invocationCallOrder[1],
    );
    expect(mocks.runRedisCommand).toHaveBeenLastCalledWith(
      expect.any(Function),
      2_000,
    );
  });

  it("revokes a live pre-authentication reference before authentication", async () => {
    const saveReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "pre-auth-session-id",
    };
    Object.defineProperties(reference, {
      save: { value: saveReference },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const sealed = await sealData(
      { oidcState: "expected-state", oidcVerifier: "verifier" },
      {
        password: process.env.SUNRISE_SESSION_SECRET!,
        ttl: 3600,
      },
    );
    const client = {
      hGetAll: vi.fn().mockResolvedValue({ version: "1", data: sealed }),
      eval: vi.fn().mockResolvedValue(1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    await rotateRedisSession(session);
    session.keystoneProjectToken = "authenticated-token";
    await session.save();

    const revoke = client.eval.mock.calls[0][1] as { keys: string[] };
    const save = client.eval.mock.calls[1][1] as { keys: string[] };
    expect(revoke.keys[0]).toContain("pre-auth-session-id");
    expect(revoke.keys[1]).toContain("pre-auth-session-id");
    expect(save.keys[0]).not.toContain("pre-auth-session-id");
    expect(reference.key).not.toBe("pre-auth-session-id");
    expect(saveReference).toHaveBeenCalledOnce();
  });

  it("keeps the session reference intact until Redis revocation succeeds", async () => {
    const destroyReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "session-to-revoke",
    };
    Object.defineProperties(reference, {
      save: { value: vi.fn() },
      destroy: { value: destroyReference },
      updateConfig: { value: vi.fn() },
    });
    const sealed = await sealData(
      { projectId: "project-old", sessionSignedInAt: Date.now() },
      {
        password: process.env.SUNRISE_SESSION_SECRET!,
        ttl: 3600,
      },
    );
    const client = {
      hGetAll: vi.fn().mockResolvedValue({ version: "1", data: sealed }),
      eval: vi
        .fn()
        .mockRejectedValueOnce(new Error("Redis unavailable"))
        .mockResolvedValueOnce(1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    await expect(destroyRedisSession(session)).rejects.toThrow(
      "Redis unavailable",
    );
    expect(destroyReference).not.toHaveBeenCalled();
    expect(session.projectId).toBe("project-old");

    await expect(destroyRedisSession(session)).resolves.toBeUndefined();
    expect(destroyReference).toHaveBeenCalledOnce();
    expect(session.projectId).toBeUndefined();
  });
});
