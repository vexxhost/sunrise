import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

type CacheEntry = { value: { kind: string }; tags: string[] };
type CacheHandler = {
  get(key: string, context?: { tags?: string[] }): Promise<CacheEntry | null>;
  set(
    key: string,
    data: { kind: string },
    context: { tags: string[] },
  ): Promise<void>;
  revalidateTag(tags: string | string[]): Promise<void>;
};
type CacheHandlerConstructor = new () => CacheHandler;

const localRequire = createRequire(import.meta.url);
const SunriseCacheHandler = localRequire(
  "./cache-handler.js",
) as CacheHandlerConstructor;
const originalBackend = process.env.SUNRISE_NEXT_CACHE_BACKEND;

afterEach(() => {
  process.env.SUNRISE_NEXT_CACHE_BACKEND = originalBackend;
});

describe("Next.js cache handler", () => {
  it("rejects an unsupported cache backend", async () => {
    process.env.SUNRISE_NEXT_CACHE_BACKEND = "redsi";
    const handler = new SunriseCacheHandler();

    await expect(handler.get("test-entry")).rejects.toThrow(
      "SUNRISE_NEXT_CACHE_BACKEND must be memory or redis",
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
});
