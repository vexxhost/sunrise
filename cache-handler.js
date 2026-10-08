const { createClient } = require("@redis/client");
const { readFileSync } = require("node:fs");
const { PHASE_PRODUCTION_BUILD } = require("next/constants");

const NEXT_CACHE_TAGS_HEADER = "x-next-cache-tags";
const MAX_MEMORY_ENTRIES = 512;
const memoryCache = new Map();
let client;
let connecting;

const SET_CACHE_ENTRY_SCRIPT = `
local entryKey = KEYS[1]
local payload = ARGV[1]
local ttlSeconds = ARGV[2]
local tagPrefix = ARGV[3]
local existing = redis.call("GET", entryKey)
local now = redis.call("TIME")
local expiresAt = 0

if ttlSeconds ~= "" then
  expiresAt = tonumber(now[1]) * 1000
    + math.floor(tonumber(now[2]) / 1000)
    + tonumber(ttlSeconds) * 1000
end

local function refreshTagExpiration(tagKey)
  if redis.call("ZCOUNT", tagKey, 0, 0) > 0 then
    redis.call("PERSIST", tagKey)
    return
  end

  local latest = redis.call("ZREVRANGE", tagKey, 0, 0, "WITHSCORES")
  if #latest == 0 then
    redis.call("DEL", tagKey)
  else
    redis.call("PEXPIREAT", tagKey, math.floor(tonumber(latest[2])))
  end
end

if existing then
  local decodedOk, decoded = pcall(cjson.decode, existing)
  if decodedOk and decoded.tags then
    for _, tag in ipairs(decoded.tags) do
      local oldTagKey = tagPrefix .. tag
      redis.call("ZREM", oldTagKey, entryKey)
      refreshTagExpiration(oldTagKey)
    end
  end
end

if ttlSeconds ~= "" then
  redis.call("SET", entryKey, payload, "EX", ttlSeconds)
else
  redis.call("SET", entryKey, payload)
end

for index = 4, #ARGV do
  local tagKey = tagPrefix .. ARGV[index]
  redis.call("ZADD", tagKey, expiresAt, entryKey)
  refreshTagExpiration(tagKey)
end
return 1
`;

const MERGE_CACHE_TAGS_SCRIPT = `
local entryKey = KEYS[1]
local tagPrefix = ARGV[1]
local payload = redis.call("GET", entryKey)

if not payload then
  return nil
end

local decodedOk, decoded = pcall(cjson.decode, payload)
if not decodedOk then
  return payload
end

local function refreshTagExpiration(tagKey)
  if redis.call("ZCOUNT", tagKey, 0, 0) > 0 then
    redis.call("PERSIST", tagKey)
    return
  end

  local latest = redis.call("ZREVRANGE", tagKey, 0, 0, "WITHSCORES")
  if #latest == 0 then
    redis.call("DEL", tagKey)
  else
    redis.call("PEXPIREAT", tagKey, math.floor(tonumber(latest[2])))
  end
end

decoded.tags = decoded.tags or {}
local knownTags = {}
for _, tag in ipairs(decoded.tags) do
  knownTags[tag] = true
end

local ttlMs = redis.call("PTTL", entryKey)
local expiresAt = 0
if ttlMs >= 0 then
  local now = redis.call("TIME")
  expiresAt = tonumber(now[1]) * 1000
    + math.floor(tonumber(now[2]) / 1000)
    + ttlMs
end

local changed = false
for index = 2, #ARGV do
  local tag = ARGV[index]
  if not knownTags[tag] then
    decoded.tags[#decoded.tags + 1] = tag
    knownTags[tag] = true
    local observedTagKey = tagPrefix .. tag
    redis.call("ZADD", observedTagKey, expiresAt, entryKey)
    refreshTagExpiration(observedTagKey)
    changed = true
  end
end

if changed then
  payload = cjson.encode(decoded)
  redis.call("SET", entryKey, payload, "KEEPTTL")
end

return payload
`;

const REVALIDATE_TAGS_SCRIPT = `
local tagPrefix = ARGV[1]
local visited = {}
local requested = {}

local function refreshTagExpiration(tagKey)
  if redis.call("ZCOUNT", tagKey, 0, 0) > 0 then
    redis.call("PERSIST", tagKey)
    return
  end

  local latest = redis.call("ZREVRANGE", tagKey, 0, 0, "WITHSCORES")
  if #latest == 0 then
    redis.call("DEL", tagKey)
  else
    redis.call("PEXPIREAT", tagKey, math.floor(tonumber(latest[2])))
  end
end

for _, requestedTagKey in ipairs(KEYS) do
  requested[requestedTagKey] = true
end

for _, requestedTagKey in ipairs(KEYS) do
  local members = redis.call("ZRANGE", requestedTagKey, 0, -1)
  for _, entryKey in ipairs(members) do
    if not visited[entryKey] then
      local payload = redis.call("GET", entryKey)
      if payload then
        local decodedOk, decoded = pcall(cjson.decode, payload)
        if decodedOk and decoded.tags then
          local shouldDelete = false
          for _, tag in ipairs(decoded.tags) do
            local relatedTagKey = tagPrefix .. tag
            if requested[relatedTagKey] then
              shouldDelete = true
            end
          end
          if shouldDelete then
            for _, tag in ipairs(decoded.tags) do
              local relatedTagKey = tagPrefix .. tag
              if not requested[relatedTagKey] then
                redis.call("ZREM", relatedTagKey, entryKey)
                refreshTagExpiration(relatedTagKey)
              end
            end
            redis.call("DEL", entryKey)
          end
        else
          redis.call("DEL", entryKey)
        end
      end
      visited[entryKey] = true
    end
  end
  redis.call("DEL", requestedTagKey)
end
return 1
`;

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
  async get(key, context) {
    const observedTags = [...new Set(context?.tags || [])];
    if (cacheBackend() !== "redis") {
      const entry = memoryCache.get(key);
      if (!entry) return null;
      for (const tag of observedTags) {
        if (!entry.tags.includes(tag)) entry.tags.push(tag);
      }
      return entry;
    }

    try {
      const value = await runCommand(async (current) => {
        const cached = observedTags.length
          ? await current.eval(MERGE_CACHE_TAGS_SCRIPT, {
              keys: [cacheKey(key)],
              arguments: [`${keyPrefix()}:tag:`, ...observedTags],
            })
          : await current.get(cacheKey(key));
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
    const ttlSeconds = Number.isFinite(expire)
      ? Math.max(1, Math.ceil(expire))
      : null;
    try {
      await runCommand(async (current) => {
        await current.eval(SET_CACHE_ENTRY_SCRIPT, {
          keys: [cacheKey(key)],
          arguments: [
            serialize(entry),
            ttlSeconds?.toString() || "",
            `${keyPrefix()}:tag:`,
            ...tags,
          ],
        });
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
      if (normalized.length) {
        await current.eval(REVALIDATE_TAGS_SCRIPT, {
          keys: normalized.map(tagKey),
          arguments: [`${keyPrefix()}:tag:`],
        });
      }
      await current.hIncrBy(metricsKey(), "revalidations", 1);
    });
  }

  resetRequestCache() {}
};
