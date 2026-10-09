const { createClient } = require("@redis/client");
const { readFileSync } = require("node:fs");
const { PHASE_PRODUCTION_BUILD } = require("next/constants");
const {
  tagsManifest,
} = require("next/dist/server/lib/incremental-cache/tags-manifest.external");

const NEXT_CACHE_TAGS_HEADER = "x-next-cache-tags";
const MAX_MEMORY_ENTRIES = 512;
const FETCH_CACHE_STALE_RETENTION_SECONDS = 24 * 60 * 60;
const MAX_FETCH_CACHE_TTL_SECONDS = 365 * 24 * 60 * 60;
const TAG_STALE_MEMBER = "__sunrise_tag_stale__";
const TAG_EXPIRED_MEMBER = "__sunrise_tag_expired__";
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
local nowMs = tonumber(now[1]) * 1000
  + math.floor(tonumber(now[2]) / 1000)
local expiresAt = 0
local payloadOk, decodedPayload = pcall(cjson.decode, payload)

if payloadOk then
  decodedPayload.lastModified = nowMs
  payload = cjson.encode(decodedPayload)
end

if ttlSeconds ~= "" then
  expiresAt = nowMs + tonumber(ttlSeconds) * 1000
end

local function refreshTagExpiration(tagKey)
  redis.call("ZREMRANGEBYSCORE", tagKey, 1, nowMs)
  if redis.call("ZCOUNT", tagKey, 0, 0) > 0 then
    redis.call("PERSIST", tagKey)
    return
  end

  local latest = redis.call(
    "ZREVRANGEBYSCORE", tagKey, "+inf", 1,
    "WITHSCORES", "LIMIT", 0, 1
  )
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
local staleMember = "${TAG_STALE_MEMBER}"
local expiredMember = "${TAG_EXPIRED_MEMBER}"
local payload = redis.call("GET", entryKey)

if not payload then
  return nil
end

local decodedOk, decoded = pcall(cjson.decode, payload)
if not decodedOk then
  return { payload }
end

local now = redis.call("TIME")
local nowMs = tonumber(now[1]) * 1000
  + math.floor(tonumber(now[2]) / 1000)

local function refreshTagExpiration(tagKey)
  redis.call("ZREMRANGEBYSCORE", tagKey, 1, nowMs)
  if redis.call("ZCOUNT", tagKey, 0, 0) > 0 then
    redis.call("PERSIST", tagKey)
    return
  end

  local latest = redis.call(
    "ZREVRANGEBYSCORE", tagKey, "+inf", 1,
    "WITHSCORES", "LIMIT", 0, 1
  )
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
  expiresAt = nowMs + ttlMs
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

local result = { payload }
for _, tag in ipairs(decoded.tags) do
  local stateKey = tagPrefix .. tag
  local staleScore = redis.call("ZSCORE", stateKey, staleMember)
  local expiredScore = redis.call("ZSCORE", stateKey, expiredMember)
  if staleScore or expiredScore then
    result[#result + 1] = tag
    result[#result + 1] = staleScore and tostring(-tonumber(staleScore)) or "0"
    result[#result + 1] = expiredScore and tostring(-tonumber(expiredScore)) or "0"
  end
end

return result
`;

const REVALIDATE_TAGS_SCRIPT = `
local tagPrefix = ARGV[1]
local mode = ARGV[2]
local expireSeconds = ARGV[3] ~= "" and tonumber(ARGV[3]) or nil
local staleMember = "${TAG_STALE_MEMBER}"
local expiredMember = "${TAG_EXPIRED_MEMBER}"
local visited = {}
local requested = {}
local now = redis.call("TIME")
local nowMs = tonumber(now[1]) * 1000
  + math.floor(tonumber(now[2]) / 1000)
local staleAt = nowMs
local expiredAt = expireSeconds and nowMs + expireSeconds * 1000 or nil

local function refreshTagExpiration(tagKey)
  redis.call("ZREMRANGEBYSCORE", tagKey, 1, nowMs)
  if redis.call("ZCOUNT", tagKey, 0, 0) > 0 then
    redis.call("PERSIST", tagKey)
    return
  end

  local latest = redis.call(
    "ZREVRANGEBYSCORE", tagKey, "+inf", 1,
    "WITHSCORES", "LIMIT", 0, 1
  )
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
  refreshTagExpiration(requestedTagKey)
  if mode == "profiled" then
    local entryCount = redis.call("ZCOUNT", requestedTagKey, 0, "+inf")
    if entryCount > 0 then
      redis.call("ZADD", requestedTagKey, -staleAt, staleMember)
      if expiredAt then
        redis.call("ZADD", requestedTagKey, -expiredAt, expiredMember)
      end
      refreshTagExpiration(requestedTagKey)
    end
  else
    local members = redis.call("ZRANGE", requestedTagKey, 0, -1)
    for _, entryKey in ipairs(members) do
      if entryKey ~= staleMember and entryKey ~= expiredMember then
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
    end
    redis.call("DEL", requestedTagKey)
  end
end
return tostring(staleAt)
`;

function cacheBackend() {
  const normalized = (process.env.SUNRISE_NEXT_CACHE_BACKEND || "memory")
    .trim()
    .toLowerCase();
  if (normalized === "memory" || normalized === "redis") return normalized;
  throw new Error("SUNRISE_NEXT_CACHE_BACKEND must be memory or redis");
}

function commandTimeoutMs() {
  const normalized = process.env.SUNRISE_REDIS_COMMAND_TIMEOUT_MS?.trim();
  if (!normalized) return 2_000;
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < 100 || value > 30_000) {
    throw new Error(
      "SUNRISE_REDIS_COMMAND_TIMEOUT_MS must be an integer from 100 to 30000",
    );
  }
  return value;
}

function keyPrefix() {
  const namespace = process.env.SUNRISE_REDIS_KEY_PREFIX?.trim() || "sunrise";
  if (!/^[A-Za-z0-9_.-]+$/.test(namespace)) {
    throw new Error(
      "SUNRISE_REDIS_KEY_PREFIX may contain only letters, digits, dots, underscores, and hyphens",
    );
  }
  const configuredDeployment = process.env.SUNRISE_DEPLOYMENT_ID?.trim();
  if (
    !configuredDeployment &&
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD
  ) {
    throw new Error(
      "SUNRISE_DEPLOYMENT_ID is required when SUNRISE_NEXT_CACHE_BACKEND=redis in production",
    );
  }
  const deployment = configuredDeployment || "development";
  return `${namespace}:next-cache:${deployment}`;
}

function cacheKey(key) {
  return `${keyPrefix()}:entry:${key}`;
}

function tagKey(tag) {
  return `${keyPrefix()}:tag:${tag}`;
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

function validateRedisConfiguration() {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;
  commandTimeoutMs();
  keyPrefix();
  connectionOptions();
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

function updateLocalTagState(tags, durations, staleAt = Date.now()) {
  for (const tag of tags) {
    const existing = tagsManifest.get(tag) || {};
    if (durations) {
      const updates = { ...existing, stale: staleAt };
      if (durations.expire !== undefined) {
        updates.expired = staleAt + durations.expire * 1_000;
      }
      tagsManifest.set(tag, updates);
    } else {
      tagsManifest.set(tag, { ...existing, expired: staleAt });
    }
  }
}

function deserializeRedisCacheResult(value) {
  if (!Array.isArray(value) || typeof value[0] !== "string") return null;

  for (let index = 1; index + 2 < value.length; index += 3) {
    const tag = value[index];
    const staleAt = Number(value[index + 1]);
    const expiredAt = Number(value[index + 2]);
    if (typeof tag !== "string" || !Number.isFinite(staleAt) || staleAt <= 0) {
      continue;
    }

    const existing = tagsManifest.get(tag) || {};
    if ((existing.stale || 0) <= staleAt) {
      const updates = { ...existing, stale: staleAt };
      if (Number.isFinite(expiredAt) && expiredAt > 0) {
        updates.expired = expiredAt;
      }
      tagsManifest.set(tag, updates);
    }
  }

  return deserialize(value[0]);
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
  const headerTags = (data?.headers?.[NEXT_CACHE_TAGS_HEADER] || "")
    .split(",")
    .filter(Boolean);
  return [
    ...new Set([
      ...(context?.tags || []),
      ...(context?.softTags || []),
      ...headerTags,
    ]),
  ];
}

function cacheTtlSeconds(data, context) {
  const expire = context?.cacheControl?.expire;
  if (Number.isFinite(expire)) return Math.max(1, Math.ceil(expire));

  // Next.js carries fetch revalidation on the cached value rather than the
  // set context. Keep a stale window for background regeneration while
  // preventing fetch keys and their tag indexes from living forever.
  if (data?.kind === "FETCH") {
    if (data.revalidate === false) return MAX_FETCH_CACHE_TTL_SECONDS;
    const revalidate = Number(data.revalidate);
    if (!Number.isFinite(revalidate) || revalidate < 0) {
      return MAX_FETCH_CACHE_TTL_SECONDS;
    }
    return Math.min(
      MAX_FETCH_CACHE_TTL_SECONDS,
      Math.max(1, Math.ceil(revalidate) + FETCH_CACHE_STALE_RETENTION_SECONDS),
    );
  }

  return null;
}

class SunriseCacheHandler {
  async get(key, context) {
    const observedTags = [
      ...new Set([...(context?.tags || []), ...(context?.softTags || [])]),
    ];
    if (cacheBackend() !== "redis") {
      const entry = memoryCache.get(key);
      if (!entry) return null;
      for (const tag of observedTags) {
        if (!entry.tags.includes(tag)) entry.tags.push(tag);
      }
      return entry;
    }
    validateRedisConfiguration();

    try {
      const value = await runCommand((current) =>
        current.eval(MERGE_CACHE_TAGS_SCRIPT, {
          keys: [cacheKey(key)],
          arguments: [`${keyPrefix()}:tag:`, ...observedTags],
        }),
      );
      return deserializeRedisCacheResult(value);
    } catch (error) {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("[next-cache] get failed:", error.message);
      }
      return null;
    }
  }

  async set(key, data, context) {
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
    validateRedisConfiguration();

    const ttlSeconds = cacheTtlSeconds(data, context);
    try {
      await runCommand((current) =>
        current.eval(SET_CACHE_ENTRY_SCRIPT, {
          keys: [cacheKey(key)],
          arguments: [
            serialize(entry),
            ttlSeconds?.toString() || "",
            `${keyPrefix()}:tag:`,
            ...tags,
          ],
        }),
      );
    } catch (error) {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.warn("[next-cache] set failed:", error.message);
      }
    }
  }

  async revalidateTag(tags, durations) {
    const normalized = [tags].flat();
    if (cacheBackend() !== "redis") {
      if (durations) {
        updateLocalTagState(normalized, durations);
      } else {
        for (const [key, entry] of memoryCache) {
          if (entry.tags.some((tag) => normalized.includes(tag))) {
            memoryCache.delete(key);
          }
        }
        updateLocalTagState(normalized);
      }
      return;
    }
    validateRedisConfiguration();

    if (!normalized.length) return;

    const result = await runCommand((current) =>
      current.eval(REVALIDATE_TAGS_SCRIPT, {
        keys: normalized.map(tagKey),
        arguments: [
          `${keyPrefix()}:tag:`,
          durations ? "profiled" : "expire",
          durations?.expire?.toString() ?? "",
        ],
      }),
    );
    const staleAt = Number(result);
    if (!Number.isFinite(staleAt) || staleAt <= 0) {
      throw new Error("Redis returned an invalid cache invalidation timestamp");
    }
    updateLocalTagState(normalized, durations, staleAt);
  }

  resetRequestCache() {}
}

SunriseCacheHandler.cacheTtlSeconds = cacheTtlSeconds;
module.exports = SunriseCacheHandler;
