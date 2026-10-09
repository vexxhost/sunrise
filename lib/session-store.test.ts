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

  it("does not rewrite an unchanged session reference", async () => {
    const saveReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "stable-session-id",
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
      hGetAll: vi.fn().mockResolvedValue({ version: "1", data: sealed }),
      eval: vi.fn().mockResolvedValue(1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    session.projectId = "project-new";
    await session.save();

    expect(client.eval).toHaveBeenCalledOnce();
    expect(reference.key).toBe("stable-session-id");
    expect(saveReference).not.toHaveBeenCalled();
  });

  it("retries a failed new session reference write", async () => {
    const saveReference = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cookie write failed"))
      .mockResolvedValueOnce(undefined);
    const reference = {
      projectId: "legacy-project",
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

    const session = await getRedisSession({} as never, {} as never);
    await expect(session.save()).rejects.toThrow("Cookie write failed");
    await expect(session.save()).resolves.toBeUndefined();

    expect(saveReference).toHaveBeenCalledTimes(2);
    expect(reference).toEqual(
      expect.objectContaining({ backend: "redis", key: expect.any(String) }),
    );
  });

  it("recreates an expired referenced session without rewriting its cookie", async () => {
    const saveReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "expired-session-id",
    };
    Object.defineProperties(reference, {
      save: { value: saveReference },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const client = {
      hGetAll: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
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
    expect(saveOptions.keys[0]).toContain("expired-session-id");
    expect(saveOptions.keys[1]).toContain("expired-session-id");
    expect(reference.key).toBe("expired-session-id");
    expect(reference.backend).toBe("redis");
    expect(saveReference).not.toHaveBeenCalled();
  });

  it("recovers a recorded rotation successor on a later request", async () => {
    const saveReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "rotated-session-root",
    };
    Object.defineProperties(reference, {
      save: { value: saveReference },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const client = {
      hGetAll: vi.fn().mockResolvedValue({}),
      get: vi
        .fn()
        .mockResolvedValueOnce("recorded-session-successor")
        .mockResolvedValueOnce(null),
      eval: vi.fn().mockResolvedValue(1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    session.oidcState = "new-login-state";
    await session.save();

    const saveOptions = client.eval.mock.calls[0][1] as { keys: string[] };
    expect(saveOptions.keys[0]).toContain("recorded-session-successor");
    expect(saveOptions.keys[1]).toContain("recorded-session-successor");
    expect(reference.key).toBe("recorded-session-successor");
    expect(saveReference).toHaveBeenCalledOnce();
  });

  it("loads data already persisted under a recorded rotation successor", async () => {
    const saveReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "persisted-rotation-root",
    };
    Object.defineProperties(reference, {
      save: { value: saveReference },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const sealed = await sealData(
      {
        projectId: "recovered-project",
        sessionSignedInAt: Date.now(),
      },
      {
        password: process.env.SUNRISE_SESSION_SECRET!,
        ttl: 3600,
      },
    );
    const client = {
      hGetAll: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ version: "1", data: sealed }),
      get: vi.fn().mockResolvedValue("persisted-rotation-successor"),
      eval: vi.fn().mockResolvedValue(1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);

    expect(session.projectId).toBe("recovered-project");
    await session.save();
    expect(reference.key).toBe("persisted-rotation-successor");
    expect(saveReference).toHaveBeenCalledOnce();
  });

  it("cannot recreate a revoked rotation successor", async () => {
    const saveReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "revoked-rotation-root",
    };
    Object.defineProperties(reference, {
      save: { value: saveReference },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const client = {
      hGetAll: vi.fn().mockResolvedValue({}),
      get: vi
        .fn()
        .mockResolvedValueOnce("revoked-rotation-successor")
        .mockResolvedValueOnce(null),
      eval: vi.fn().mockResolvedValue(-1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    session.oidcState = "new-login-state";

    await expect(session.save()).rejects.toThrow(
      "Cannot save a revoked Sunrise session",
    );
    const saveOptions = client.eval.mock.calls[0][1] as { keys: string[] };
    expect(saveOptions.keys[0]).toContain("revoked-rotation-successor");
    expect(saveOptions.keys[1]).toContain("revoked-rotation-successor");
    expect(reference.key).toBe("revoked-rotation-root");
    expect(saveReference).not.toHaveBeenCalled();
  });

  it("cannot remint a reference revoked after its record disappeared", async () => {
    const saveReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "revoked-missing-session-id",
    };
    Object.defineProperties(reference, {
      save: { value: saveReference },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const client = {
      hGetAll: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      // The atomic save observes the tombstone written by a concurrent logout.
      eval: vi.fn().mockResolvedValue(-1),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    session.oidcState = "new-login-state";

    await expect(session.save()).rejects.toThrow(
      "Cannot save a revoked Sunrise session",
    );
    const saveOptions = client.eval.mock.calls[0][1] as { keys: string[] };
    expect(saveOptions.keys[0]).toContain("revoked-missing-session-id");
    expect(saveOptions.keys[1]).toContain("revoked-missing-session-id");
    expect(reference.key).toBe("revoked-missing-session-id");
    expect(saveReference).not.toHaveBeenCalled();
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

  it("can abort a CAS retry after inspecting authoritative state", async () => {
    const reference = {
      backend: "redis",
      key: "preserve-authoritative-session-id",
    };
    Object.defineProperties(reference, {
      save: { value: vi.fn() },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const initial = await sealData(
      { keycloakRefreshToken: "old-token", projectId: "project-old" },
      { password: process.env.SUNRISE_SESSION_SECRET!, ttl: 3600 },
    );
    const concurrent = await sealData(
      { keycloakRefreshToken: "interactive-token", projectId: "project-old" },
      { password: process.env.SUNRISE_SESSION_SECRET!, ttl: 3600 },
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
    session.keycloakRefreshToken = "background-token";
    await expect(
      saveRedisSession(session, {
        validateConflictRetry: (authoritative) => {
          if (authoritative.keycloakRefreshToken !== "background-token") {
            throw new Error("superseded");
          }
        },
      }),
    ).rejects.toThrow("superseded");

    expect(client.eval).toHaveBeenCalledOnce();
  });

  it("revokes a live pre-authentication reference before authentication", async () => {
    process.env.SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS = "600";
    process.env.SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS = "3600";
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
      eval: vi
        .fn()
        .mockImplementationOnce(
          (_script: string, options: { arguments: string[] }) =>
            Promise.resolve(options.arguments[1]),
        )
        .mockResolvedValueOnce(1),
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

    const rotation = client.eval.mock.calls[0][1] as {
      arguments: string[];
      keys: string[];
    };
    const save = client.eval.mock.calls[1][1] as { keys: string[] };
    expect(rotation.keys[0]).toContain("pre-auth-session-id");
    expect(rotation.keys[1]).toContain("pre-auth-session-id");
    expect(rotation.keys[2]).toContain("pre-auth-session-id");
    expect(rotation.arguments).toHaveLength(2);
    expect(rotation.arguments[0]).toBe("3600");
    expect(save.keys[0]).not.toContain("pre-auth-session-id");
    expect(reference.key).not.toBe("pre-auth-session-id");
    expect(saveReference).toHaveBeenCalledOnce();
  });

  it.each([
    { state: "revoked by logout" },
    { state: "missing after expiry" },
  ])(
    "cannot rotate a pre-authentication reference $state",
    async () => {
      const saveReference = vi.fn();
      const reference = {
        backend: "redis",
        key: "logged-out-pre-auth-session-id",
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
        eval: vi.fn().mockResolvedValue(""),
      };
      mocks.getIronSession.mockResolvedValue(reference);
      mocks.runRedisCommand.mockImplementation(
        (operation: (current: typeof client) => Promise<unknown>) =>
          operation(client),
      );

      const session = await getRedisSession({} as never, {} as never);

      await expect(rotateRedisSession(session)).rejects.toThrow(
        "Cannot rotate a missing or revoked Sunrise session",
      );
      expect(reference.key).toBe("logged-out-pre-auth-session-id");
      expect(saveReference).not.toHaveBeenCalled();

      const rotation = client.eval.mock.calls[0][1] as { keys: string[] };
      expect(rotation.keys[0]).toContain("logged-out-pre-auth-session-id");
      expect(rotation.keys[1]).toContain("logged-out-pre-auth-session-id");
      expect(rotation.keys[2]).toContain("logged-out-pre-auth-session-id");
    },
  );

  it("recovers the successor after an ambiguously committed rotation", async () => {
    const saveReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "ambiguous-pre-auth-session-id",
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
      eval: vi
        .fn()
        .mockRejectedValueOnce(new Error("Redis response was lost"))
        .mockImplementationOnce(
          (_script: string, options: { arguments: string[] }) =>
            Promise.resolve(options.arguments[1]),
        )
        .mockResolvedValueOnce(1),
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

    const firstRotation = client.eval.mock.calls[0][1] as {
      arguments: string[];
      keys: string[];
    };
    const recoveredRotation = client.eval.mock.calls[1][1] as {
      arguments: string[];
      keys: string[];
    };
    expect(recoveredRotation.arguments[1]).toBe(firstRotation.arguments[1]);
    expect(recoveredRotation.keys).toEqual(firstRotation.keys);
    expect(reference.key).toBe(firstRotation.arguments[1]);
    expect(saveReference).toHaveBeenCalledOnce();
  });

  it("lets a concurrent logout revoke the recorded rotation successor", async () => {
    const callbackSaveReference = vi.fn();
    const callbackReference = {
      backend: "redis",
      key: "concurrent-rotation-session-id",
    };
    Object.defineProperties(callbackReference, {
      save: { value: callbackSaveReference },
      destroy: { value: vi.fn() },
      updateConfig: { value: vi.fn() },
    });
    const logoutDestroyReference = vi.fn();
    const logoutReference = {
      backend: "redis",
      key: "concurrent-rotation-session-id",
    };
    Object.defineProperties(logoutReference, {
      save: { value: vi.fn() },
      destroy: { value: logoutDestroyReference },
      updateConfig: { value: vi.fn() },
    });
    const sealed = await sealData(
      { oidcState: "expected-state", oidcVerifier: "verifier" },
      {
        password: process.env.SUNRISE_SESSION_SECRET!,
        ttl: 3600,
      },
    );
    let successorId = "";
    const client = {
      hGetAll: vi.fn().mockResolvedValue({ version: "1", data: sealed }),
      eval: vi.fn().mockImplementation(
        (_script: string, options: { arguments: string[]; keys: string[] }) => {
          const call = client.eval.mock.calls.length;
          if (call === 1) {
            successorId = options.arguments[1];
            return Promise.resolve(successorId);
          }
          if (call === 2) return Promise.resolve(successorId);
          if (call === 3) return Promise.resolve("");
          return Promise.resolve(-1);
        },
      ),
    };
    mocks.getIronSession
      .mockResolvedValueOnce(callbackReference)
      .mockResolvedValueOnce(logoutReference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const callbackSession = await getRedisSession({} as never, {} as never);
    const logoutSession = await getRedisSession({} as never, {} as never);
    await rotateRedisSession(callbackSession);
    await destroyRedisSession(logoutSession);

    callbackSession.keystoneProjectToken = "authenticated-token";
    await expect(callbackSession.save()).rejects.toThrow(
      "Cannot save a revoked Sunrise session",
    );
    expect(logoutDestroyReference).toHaveBeenCalledOnce();
    expect(callbackSaveReference).not.toHaveBeenCalled();
    expect(client.eval).toHaveBeenCalledTimes(4);
  });

  it("revokes an entire session rotation chain", async () => {
    const destroyReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "rotation-chain-root",
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
    const successors = Array.from(
      { length: 20 },
      (_, index) => `rotation-chain-${index + 1}`,
    );
    const client = {
      hGetAll: vi.fn().mockResolvedValue({ version: "1", data: sealed }),
      eval: vi
        .fn()
        .mockImplementation(() => Promise.resolve(successors.shift() ?? "")),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    await destroyRedisSession(session);

    expect(client.eval).toHaveBeenCalledTimes(21);
    expect(destroyReference).toHaveBeenCalledOnce();
  });

  it("recovers a successor after an ambiguously committed revocation", async () => {
    const destroyReference = vi.fn();
    const reference = {
      backend: "redis",
      key: "ambiguous-revocation-root",
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
        .mockRejectedValueOnce(new Error("Redis response was lost"))
        .mockResolvedValueOnce("ambiguous-revocation-successor")
        .mockResolvedValueOnce(""),
    };
    mocks.getIronSession.mockResolvedValue(reference);
    mocks.runRedisCommand.mockImplementation(
      (operation: (current: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const session = await getRedisSession({} as never, {} as never);
    await destroyRedisSession(session);

    const firstAttempt = client.eval.mock.calls[0][1] as { keys: string[] };
    const recoveredAttempt = client.eval.mock.calls[1][1] as {
      keys: string[];
    };
    const successorAttempt = client.eval.mock.calls[2][1] as {
      keys: string[];
    };
    expect(recoveredAttempt.keys).toEqual(firstAttempt.keys);
    expect(successorAttempt.keys).not.toEqual(firstAttempt.keys);
    expect(successorAttempt.keys).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ambiguous-revocation-successor"),
      ]),
    );
    expect(destroyReference).toHaveBeenCalledOnce();
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
