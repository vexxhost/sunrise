const { createClient } = require("@redis/client");
const { readFileSync } = require("node:fs");
const { PHASE_PRODUCTION_BUILD } = require("next/constants");

const NEXT_CACHE_TAGS_HEADER = "x-next-cache-tags";
const MAX_MEMORY_ENTRIES = 512;
const memoryCache = new Map();
let client;
let connecting;

function cacheBackend() {
  return (process.env.SUNRISE_NEXT_CACHE_BACKEND || "memory")
    .trim()
    .toLowerCase();
}

function commandTimeoutMs() {
  const value = Number(process.env.SUNRISE_REDIS_COMMAND_TIMEOUT_MS || "2000");
  return Number.isSafeInteger(value) && value >= 100 && value <= 30_000
    ? value
    : 2_000;
}

function keyPrefix() {
  const namespace = process.env.SUNRISE_REDIS_KEY_PREFIX || "sunrise";
  const deployment = process.env.SUNRISE_DEPLOYMENT_ID || "development";
  return `${namespace}:next-cache:${deployment}`;
}

function cacheKey(key) {
  return `${keyPrefix()}:entry:${key}`;
}

function tagKey(tag) {
  return `${keyPrefix()}:tag:${tag}`;
}

function metricsKey() {
  return `${keyPrefix()}:metrics`;
}

function connectionOptions() {
  const url = process.env.SUNRISE_REDIS_URL?.trim();
  if (!url) {
    throw new Error(
      "SUNRISE_REDIS_URL is required when SUNRISE_NEXT_CACHE_BACKEND=redis",
    );
  }

  const parsed = new URL(url);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error("SUNRISE_REDIS_URL must use redis:// or rediss://");
  }

  const username = process.env.SUNRISE_REDIS_USERNAME?.trim() || undefined;
  const password = process.env.SUNRISE_REDIS_PASSWORD || undefined;
  if (username && !password) {
    throw new Error(
      "SUNRISE_REDIS_PASSWORD is required when SUNRISE_REDIS_USERNAME is set",
    );
  }

  const caPath = process.env.SUNRISE_REDIS_CA_FILE?.trim();
  if (caPath && parsed.protocol !== "rediss:") {
    throw new Error(
      "SUNRISE_REDIS_CA_FILE requires a rediss:// SUNRISE_REDIS_URL",
    );
  }

  return {
    url,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 1500,
      reconnectStrategy: false,
      ...(caPath
        ? {
            tls: true,
            ca: readFileSync(/* turbopackIgnore: true */ caPath),
          }
        : {}),
    },
  };
}

function serialize(entry) {
  return JSON.stringify(entry, (_key, value) => {
    if (value instanceof Map) {
      return { __type: "Map", value: Array.from(value.entries()) };
    }
    return value;
  });
}

function deserialize(text) {
  return JSON.parse(text, (_key, value) => {
    if (value?.__type === "Map") return new Map(value.value);
    if (value?.type === "Buffer" && Array.isArray(value.data)) {
      return Buffer.from(value.data);
    }
    return value;
  });
}

function clearClient(current) {
  if (client === current) client = undefined;
  connecting = undefined;
  if (current?.isOpen) current.destroy();
}

async function getClient() {
  if (cacheBackend() !== "redis") return null;
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return null;
  if (client?.isReady) return client;
  if (connecting) return connecting;

  const current = createClient(connectionOptions());
  client = current;
  current.on("error", (error) => {
    if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
      console.warn("[next-cache] Redis connection error:", error.message);
    }
  });
  connecting = current
    .connect()
    .then(() => {
      connecting = undefined;
      return current;
    })
    .catch((error) => {
      clearClient(current);
      throw error;
    });
  return connecting;
}

async function runCommand(operation) {
  const current = await getClient();
  if (!current) return undefined;
  const timeoutMs = commandTimeoutMs();
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Next.js cache command timed out after ${timeoutMs}ms`));
      clearClient(current);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(current), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function tagsFor(data, context) {
  const headerTags = (data.headers?.[NEXT_CACHE_TAGS_HEADER] || "")
    .split(",")
    .filter(Boolean);
  return [...new Set([...(context?.tags || []), ...headerTags])];
}

module.exports = class SunriseCacheHandler {
  async get(key) {
    if (cacheBackend() !== "redis") return memoryCache.get(key) || null;

    try {
      const value = await runCommand(async (current) => {
        const cached = await current.get(cacheKey(key));
        await current.hIncrBy(metricsKey(), cached ? "hits" : "misses", 1);
        return cached;
      });
      return value ? deserialize(value) : null;
    } catch (error) {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("[next-cache] get failed:", error.message);
      }
      return null;
    }
  }

  async set(key, data, context) {
    if (!data) return;
    const tags = tagsFor(data, context);
    const entry = { value: data, lastModified: Date.now(), tags };
    if (cacheBackend() !== "redis") {
      while (memoryCache.size >= MAX_MEMORY_ENTRIES) {
        const oldest = memoryCache.keys().next().value;
        if (oldest === undefined) break;
        memoryCache.delete(oldest);
      }
      memoryCache.set(key, entry);
      return;
    }

    const expire = context?.cacheControl?.expire;
    const options = Number.isFinite(expire)
      ? { expiration: { type: "EX", value: Math.max(1, Math.ceil(expire)) } }
      : {};
    try {
      await runCommand(async (current) => {
        await current.set(cacheKey(key), serialize(entry), options);
        if (tags.length) {
          await Promise.all(
            tags.map((tag) => current.sAdd(tagKey(tag), cacheKey(key))),
          );
        }
        await current.hIncrBy(metricsKey(), "sets", 1);
      });
    } catch (error) {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("[next-cache] set failed:", error.message);
      }
    }
  }

  async revalidateTag(tags) {
    const normalized = [tags].flat();
    if (cacheBackend() !== "redis") {
      for (const [key, entry] of memoryCache) {
        if (entry.tags.some((tag) => normalized.includes(tag))) {
          memoryCache.delete(key);
        }
      }
      return;
    }

    await runCommand(async (current) => {
      for (const tag of normalized) {
        const index = tagKey(tag);
        const keys = await current.sMembers(index);
        if (keys.length) {
          await Promise.all(keys.map((key) => current.del(key)));
        }
        await current.del(index);
      }
      await current.hIncrBy(metricsKey(), "revalidations", 1);
    });
  }

  resetRequestCache() {}
};
