import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
    mocks.getRedisKeyPrefix.mockReturnValue("sunrise");
    mocks.probeRedisReadiness.mockResolvedValue(1.25);
  });

  it("does not require Redis for local development backends", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      sessionBackend: "cookie",
      redisLatencyMs: null,
    });
    expect(mocks.probeRedisReadiness).not.toHaveBeenCalled();
  });

  it("checks Redis session write capabilities", async () => {
    mocks.getSessionBackend.mockReturnValue("redis");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.probeRedisReadiness).toHaveBeenCalledOnce();
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
});
