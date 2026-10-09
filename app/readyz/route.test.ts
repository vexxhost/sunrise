import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNextCacheBackend: vi.fn(),
  getNextCacheDeploymentId: vi.fn(),
  getRedisKeyPrefix: vi.fn(),
  getSessionBackend: vi.fn(),
  probeRedisReadiness: vi.fn(),
}));

vi.mock("@/lib/redis", () => mocks);

import { GET } from "./route";

describe("readiness route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getSessionBackend.mockReturnValue("cookie");
    mocks.getNextCacheBackend.mockReturnValue("memory");
    mocks.getNextCacheDeploymentId.mockReturnValue("build-123");
    mocks.getRedisKeyPrefix.mockReturnValue("sunrise");
    mocks.probeRedisReadiness.mockResolvedValue(1.25);
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
    expect(mocks.probeRedisReadiness).not.toHaveBeenCalled();
  });

  it("checks Redis when only the shared Next.js cache uses it", async () => {
    mocks.getNextCacheBackend.mockReturnValue("redis");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getRedisKeyPrefix).toHaveBeenCalledOnce();
    expect(mocks.getNextCacheDeploymentId).toHaveBeenCalledOnce();
    expect(mocks.probeRedisReadiness).toHaveBeenCalledWith({
      sessions: false,
      nextCache: true,
    });
  });

  it("checks session write capabilities without requiring cache commands", async () => {
    mocks.getSessionBackend.mockReturnValue("redis");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.probeRedisReadiness).toHaveBeenCalledWith({
      sessions: true,
      nextCache: false,
    });
  });

  it("fails readiness when Redis cannot perform required writes", async () => {
    mocks.getSessionBackend.mockReturnValue("redis");
    mocks.probeRedisReadiness.mockRejectedValue(
      new Error("READONLY You can't write against a read only replica"),
    );

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "not-ready" });
  });

  it("fails readiness when a production cache deployment ID is missing", async () => {
    mocks.getNextCacheBackend.mockReturnValue("redis");
    mocks.getNextCacheDeploymentId.mockImplementation(() => {
      throw new Error("SUNRISE_DEPLOYMENT_ID is required");
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(mocks.probeRedisReadiness).not.toHaveBeenCalled();
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
