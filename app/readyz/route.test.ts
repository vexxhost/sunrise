import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNextCacheBackend: vi.fn(),
  getRedisKeyPrefix: vi.fn(),
  getSessionBackend: vi.fn(),
  pingRedis: vi.fn(),
}));

vi.mock("@/lib/redis", () => mocks);

import { GET } from "./route";

describe("readiness route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getSessionBackend.mockReturnValue("cookie");
    mocks.getNextCacheBackend.mockReturnValue("memory");
    mocks.getRedisKeyPrefix.mockReturnValue("sunrise");
    mocks.pingRedis.mockResolvedValue(1.25);
  });

  it("does not require Redis for local development backends", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      sessionBackend: "cookie",
      nextCacheBackend: "memory",
      redisLatencyMs: null,
    });
    expect(mocks.pingRedis).not.toHaveBeenCalled();
  });

  it("checks Redis when only the shared Next.js cache uses it", async () => {
    mocks.getNextCacheBackend.mockReturnValue("redis");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getRedisKeyPrefix).toHaveBeenCalledOnce();
    expect(mocks.pingRedis).toHaveBeenCalledOnce();
  });

  it("fails readiness when Redis cache configuration is invalid", async () => {
    mocks.getNextCacheBackend.mockImplementation(() => {
      throw new Error("invalid cache backend");
    });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "not-ready" });
  });
});
