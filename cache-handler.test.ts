import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

type CacheEntry = {
  value: { kind: string } | null;
  lastModified: number;
  tags: string[];
};
type CacheHandler = {
  get(
    key: string,
    context?: { tags?: string[]; softTags?: string[] },
  ): Promise<CacheEntry | null>;
  set(
    key: string,
    data: { kind: string } | null,
    context: { tags: string[] },
  ): Promise<void>;
  revalidateTag(
    tags: string | string[],
    durations?: { expire?: number },
  ): Promise<void>;
};
type CacheHandlerConstructor = new () => CacheHandler;
type CacheHandlerModule = CacheHandlerConstructor & {
  cacheTtlSeconds(
    data: { kind: string; revalidate?: number | false } | null,
    context: { cacheControl?: { expire?: number } },
  ): number | null;
};

const localRequire = createRequire(import.meta.url);
const SunriseCacheHandler = localRequire(
  "./cache-handler.js",
) as CacheHandlerModule;
const { tagsManifest } = localRequire(
  "next/dist/server/lib/incremental-cache/tags-manifest.external",
) as {
  tagsManifest: Map<string, { stale?: number; expired?: number }>;
};
const originalBackend = process.env.SUNRISE_NEXT_CACHE_BACKEND;
const originalRedisUrl = process.env.SUNRISE_REDIS_URL;
const originalRedisTimeout = process.env.SUNRISE_REDIS_COMMAND_TIMEOUT_MS;
const originalRedisPrefix = process.env.SUNRISE_REDIS_KEY_PREFIX;
const originalDeploymentId = process.env.SUNRISE_DEPLOYMENT_ID;
const originalNodeEnv = process.env.NODE_ENV;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function setEnvironment(name: string, value: string) {
  process.env[name] = value;
}

afterEach(() => {
  vi.useRealTimers();
  tagsManifest.clear();
  restoreEnvironment("SUNRISE_NEXT_CACHE_BACKEND", originalBackend);
  restoreEnvironment("SUNRISE_REDIS_URL", originalRedisUrl);
  restoreEnvironment("SUNRISE_REDIS_COMMAND_TIMEOUT_MS", originalRedisTimeout);
  restoreEnvironment("SUNRISE_REDIS_KEY_PREFIX", originalRedisPrefix);
  restoreEnvironment("SUNRISE_DEPLOYMENT_ID", originalDeploymentId);
  restoreEnvironment("NODE_ENV", originalNodeEnv);
});

describe("Next.js cache handler", () => {
  it("bounds fetch-cache retention while preserving a stale window", () => {
    expect(
      SunriseCacheHandler.cacheTtlSeconds(
        { kind: "FETCH", revalidate: 60 },
        {},
      ),
    ).toBe(86_460);
    expect(
      SunriseCacheHandler.cacheTtlSeconds(
        { kind: "FETCH", revalidate: 31_536_000 },
        {},
      ),
    ).toBe(31_536_000);
    expect(
      SunriseCacheHandler.cacheTtlSeconds(
        { kind: "FETCH", revalidate: false },
        {},
      ),
    ).toBe(31_536_000);
    expect(
      SunriseCacheHandler.cacheTtlSeconds(
        { kind: "APP_ROUTE" },
        { cacheControl: { expire: 120 } },
      ),
    ).toBe(120);
  });

  it("rejects an unsupported cache backend", async () => {
    process.env.SUNRISE_NEXT_CACHE_BACKEND = "redsi";
    const handler = new SunriseCacheHandler();

    await expect(handler.get("test-entry")).rejects.toThrow(
      "SUNRISE_NEXT_CACHE_BACKEND must be memory or redis",
    );
  });

  it("rejects malformed Redis configuration before treating it as a miss", async () => {
    process.env.SUNRISE_NEXT_CACHE_BACKEND = "redis";
    process.env.SUNRISE_REDIS_URL = "redis://cache:6379";
    process.env.SUNRISE_REDIS_COMMAND_TIMEOUT_MS = "fast";
    const handler = new SunriseCacheHandler();

    await expect(handler.get("test-entry")).rejects.toThrow(
      "SUNRISE_REDIS_COMMAND_TIMEOUT_MS",
    );

    process.env.SUNRISE_REDIS_COMMAND_TIMEOUT_MS = "2000";
    process.env.SUNRISE_REDIS_KEY_PREFIX = "shared:prefix";
    await expect(
      handler.set("test-entry", { kind: "APP_ROUTE" }, { tags: [] }),
    ).rejects.toThrow("SUNRISE_REDIS_KEY_PREFIX");

    process.env.SUNRISE_REDIS_KEY_PREFIX = "sunrise";
    delete process.env.SUNRISE_REDIS_URL;
    await expect(handler.revalidateTag("test-tag")).rejects.toThrow(
      "SUNRISE_REDIS_URL is required",
    );
  });

  it("rejects a production Redis cache without a deployment ID", async () => {
    setEnvironment("NODE_ENV", "production");
    process.env.SUNRISE_NEXT_CACHE_BACKEND = "redis";
    process.env.SUNRISE_REDIS_URL = "redis://cache:6379";
    delete process.env.SUNRISE_DEPLOYMENT_ID;
    const handler = new SunriseCacheHandler();

    await expect(handler.get("test-entry")).rejects.toThrow(
      "SUNRISE_DEPLOYMENT_ID is required",
    );
  });

  it("stores and invalidates entries in the bounded local fallback", async () => {
    process.env.SUNRISE_NEXT_CACHE_BACKEND = "memory";
    const handler = new SunriseCacheHandler();

    await handler.set(
      "test-entry",
      { kind: "APP_ROUTE" },
      {
        tags: ["test-tag"],
      },
    );
    await expect(handler.get("test-entry")).resolves.toMatchObject({
      value: { kind: "APP_ROUTE" },
      tags: ["test-tag"],
    });

    await handler.revalidateTag("test-tag");
    await expect(handler.get("test-entry")).resolves.toBeNull();
  });

  it("preserves entries for profiled stale-while-revalidate", async () => {
    process.env.SUNRISE_NEXT_CACHE_BACKEND = "memory";
    const handler = new SunriseCacheHandler();
    await handler.set(
      "profiled-entry",
      { kind: "APP_ROUTE" },
      { tags: ["profiled-tag"] },
    );
    const invalidatedAt = Date.now();

    await handler.revalidateTag("profiled-tag", { expire: 60 });

    await expect(handler.get("profiled-entry")).resolves.toMatchObject({
      value: { kind: "APP_ROUTE" },
      tags: ["profiled-tag"],
    });
    const state = tagsManifest.get("profiled-tag");
    expect(state?.stale).toBeGreaterThanOrEqual(invalidatedAt);
    expect(state?.expired).toBe((state?.stale ?? 0) + 60_000);
  });

  it("preserves invalidation state for tags observed by a later read", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    process.env.SUNRISE_NEXT_CACHE_BACKEND = "memory";
    const handler = new SunriseCacheHandler();
    await handler.set(
      "later-tagged-entry",
      { kind: "FETCH" },
      { tags: ["initial-tag"] },
    );

    vi.setSystemTime(2_000);
    await handler.revalidateTag("later-tag", { expire: 60 });
    const entry = await handler.get("later-tagged-entry", {
      tags: ["later-tag"],
    });

    expect(entry?.tags).toContain("later-tag");
    expect(tagsManifest.get("later-tag")?.stale).toBeGreaterThan(
      entry?.lastModified ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("tracks tags observed by later reads of the same cache key", async () => {
    process.env.SUNRISE_NEXT_CACHE_BACKEND = "memory";
    const handler = new SunriseCacheHandler();

    await handler.set(
      "shared-fetch-entry",
      { kind: "FETCH" },
      { tags: ["first-tag"] },
    );
    await expect(
      handler.get("shared-fetch-entry", { tags: ["second-tag"] }),
    ).resolves.toMatchObject({
      tags: ["first-tag", "second-tag"],
    });

    await handler.revalidateTag("second-tag");
    await expect(handler.get("shared-fetch-entry")).resolves.toBeNull();
  });

  it("tracks soft tags observed by later reads", async () => {
    process.env.SUNRISE_NEXT_CACHE_BACKEND = "memory";
    const handler = new SunriseCacheHandler();

    await handler.set(
      "soft-tag-entry",
      { kind: "FETCH" },
      { tags: ["initial-tag"] },
    );
    await handler.get("soft-tag-entry", { softTags: ["path-tag"] });

    await handler.revalidateTag("path-tag");
    await expect(handler.get("soft-tag-entry")).resolves.toBeNull();
  });

  it("replaces an existing value when Next.js writes a null entry", async () => {
    process.env.SUNRISE_NEXT_CACHE_BACKEND = "memory";
    const handler = new SunriseCacheHandler();

    await handler.set(
      "null-entry",
      { kind: "APP_ROUTE" },
      { tags: ["route-tag"] },
    );
    await handler.set("null-entry", null, { tags: [] });

    await expect(handler.get("null-entry")).resolves.toMatchObject({
      value: null,
      tags: [],
    });
  });
});
