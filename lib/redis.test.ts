import { describe, expect, it } from "vitest";
import {
  getNextCacheBackend,
  getRedisCa,
  getSessionBackend,
  getRedisCommandTimeoutMs,
  getRedisCredentials,
  getRedisKeyPrefix,
  getRedisUrl,
} from "@/lib/redis";

describe("Redis deployment configuration", () => {
  it("uses the cookie backend unless Redis is selected explicitly", () => {
    expect(getSessionBackend(undefined)).toBe("cookie");
    expect(getSessionBackend(" REDIS ")).toBe("redis");
    expect(() => getSessionBackend("memory")).toThrow(
      "SUNRISE_SESSION_BACKEND must be cookie or redis",
    );
  });

  it("validates the shared Next.js cache backend", () => {
    expect(getNextCacheBackend(undefined)).toBe("memory");
    expect(getNextCacheBackend(" REDIS ")).toBe("redis");
    expect(() => getNextCacheBackend("redsi")).toThrow(
      "SUNRISE_NEXT_CACHE_BACKEND must be memory or redis",
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
});
