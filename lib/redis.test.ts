import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@redis/client", () => ({
  createClient: mocks.createClient,
}));

import {
  closeRedisForTests,
  getRedisCa,
  getSessionBackend,
  getRedisCommandTimeoutMs,
  getRedisCredentials,
  getRedisKeyPrefix,
  getRedisUrl,
  probeRedisReadiness,
  runIsolatedRedisCommand,
  runRedisCommand,
} from "@/lib/redis";

const originalRedisUrl = process.env.SUNRISE_REDIS_URL;
const originalRedisTimeout = process.env.SUNRISE_REDIS_COMMAND_TIMEOUT_MS;
const originalRedisPrefix = process.env.SUNRISE_REDIS_KEY_PREFIX;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function redisClient(command: () => Promise<unknown>) {
  const client = {
    isOpen: false,
    on: vi.fn(),
    connect: vi.fn(async () => {
      client.isOpen = true;
      return client;
    }),
    destroy: vi.fn(() => {
      client.isOpen = false;
    }),
    withAbortSignal: vi.fn(() => client),
    eval: vi.fn(async (_script: string, _options?: unknown) => command()),
    get: vi.fn(command),
  };
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUNRISE_REDIS_URL = "redis://cache:6379";
  process.env.SUNRISE_REDIS_COMMAND_TIMEOUT_MS = "2000";
});

afterEach(async () => {
  vi.useRealTimers();
  await closeRedisForTests();
  restoreEnvironment("SUNRISE_REDIS_URL", originalRedisUrl);
  restoreEnvironment("SUNRISE_REDIS_COMMAND_TIMEOUT_MS", originalRedisTimeout);
  restoreEnvironment("SUNRISE_REDIS_KEY_PREFIX", originalRedisPrefix);
});

describe("Redis deployment configuration", () => {
  it("uses the cookie backend unless Redis is selected explicitly", () => {
    expect(getSessionBackend(undefined)).toBe("cookie");
    expect(getSessionBackend(" REDIS ")).toBe("redis");
    expect(() => getSessionBackend("memory")).toThrow(
      "SUNRISE_SESSION_BACKEND must be cookie or redis",
    );
  });

  it("normalizes an empty prefix and rejects unsafe namespaces", () => {
    expect(getRedisKeyPrefix(undefined)).toBe("sunrise");
    expect(getRedisKeyPrefix(" atmosphere.demo_1 ")).toBe("atmosphere.demo_1");
    expect(() => getRedisKeyPrefix("shared:prefix")).toThrow(
      "SUNRISE_REDIS_KEY_PREFIX",
    );
  });

  it("bounds the per-command timeout", () => {
    expect(getRedisCommandTimeoutMs(undefined)).toBe(2_000);
    expect(getRedisCommandTimeoutMs(" 5000 ")).toBe(5_000);
    expect(() => getRedisCommandTimeoutMs("50")).toThrow(
      "SUNRISE_REDIS_COMMAND_TIMEOUT_MS",
    );
  });

  it("accepts plain and TLS Redis URLs", () => {
    expect(getRedisUrl(" redis://cache:6379 ")).toBe("redis://cache:6379");
    expect(getRedisUrl("rediss://cache:6380")).toBe("rediss://cache:6380");
    expect(() => getRedisUrl("https://cache.example.com")).toThrow(
      "redis:// or rediss://",
    );
  });

  it("supports password and ACL authentication without requiring URL secrets", () => {
    expect(getRedisCredentials(undefined, undefined)).toEqual({});
    expect(getRedisCredentials(undefined, "secret")).toEqual({
      password: "secret",
    });
    expect(getRedisCredentials(" sunrise ", "secret")).toEqual({
      username: "sunrise",
      password: "secret",
    });
    expect(() => getRedisCredentials("sunrise", undefined)).toThrow(
      "SUNRISE_REDIS_PASSWORD",
    );
  });

  it("loads private certificate authorities only for TLS connections", () => {
    const readFile = (path: string) => Buffer.from(`certificate:${path}`);
    expect(
      getRedisCa("rediss://cache:6379", " /run/redis/ca.crt ", readFile),
    ).toEqual(Buffer.from("certificate:/run/redis/ca.crt"));
    expect(() =>
      getRedisCa("redis://cache:6379", "/run/redis/ca.crt", readFile),
    ).toThrow("requires a rediss://");
  });

  it("closes an isolated connection after a successful command", async () => {
    const client = redisClient(async () => "value");
    mocks.createClient.mockReturnValue(client);

    await expect(
      runIsolatedRedisCommand((current) => current.get("key"), 500),
    ).resolves.toBe("value");

    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith("key");
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("destroys only the isolated connection when its command times out", async () => {
    vi.useFakeTimers();
    const client = redisClient(() => new Promise(() => undefined));
    mocks.createClient.mockReturnValue(client);

    const command = runIsolatedRedisCommand(
      (current) => current.get("key"),
      500,
    );
    const rejection = expect(command).rejects.toThrow(
      "Redis command timed out after 500ms",
    );
    await vi.advanceTimersByTimeAsync(500);

    await rejection;
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("isolates a shorter timeout override from the shared client", async () => {
    process.env.SUNRISE_REDIS_COMMAND_TIMEOUT_MS = "5000";
    const client = redisClient(async () => "value");
    mocks.createClient.mockReturnValue(client);

    await expect(
      runRedisCommand((current) => current.get("key"), 2_000),
    ).resolves.toBe("value");

    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("probes the runtime session and refresh ACL namespaces", async () => {
    process.env.SUNRISE_REDIS_KEY_PREFIX = "atmosphere";
    const client = redisClient(async () => 1);
    mocks.createClient.mockReturnValue(client);

    await expect(probeRedisReadiness()).resolves.toEqual(expect.any(Number));

    expect(client.eval).toHaveBeenCalledOnce();
    expect(client.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: [
        expect.stringMatching(/^atmosphere:session:\{[^}]+\}$/),
        expect.stringMatching(/^atmosphere:session-revoked:\{[^}]+\}$/),
        expect.stringMatching(/^atmosphere:oidc-refresh-lock:[^:]+$/),
      ],
      arguments: [expect.any(String)],
    });
  });
});
