import { readFileSync } from "node:fs";
import { createClient, type RedisClientType } from "@redis/client";

export type SessionBackend = "cookie" | "redis";
export type NextCacheBackend = "memory" | "redis";

type RedisRuntime = {
  client?: RedisClientType;
  connecting?: Promise<RedisClientType>;
};

const runtime = globalThis as typeof globalThis & {
  sunriseRedisRuntime?: RedisRuntime;
};

const state = runtime.sunriseRedisRuntime ?? {};
runtime.sunriseRedisRuntime = state;

export function getSessionBackend(
  value = process.env.SUNRISE_SESSION_BACKEND,
): SessionBackend {
  const normalized = value?.trim().toLowerCase() || "cookie";
  if (normalized === "cookie" || normalized === "redis") return normalized;
  throw new Error("SUNRISE_SESSION_BACKEND must be cookie or redis");
}

export function getNextCacheBackend(
  value = process.env.SUNRISE_NEXT_CACHE_BACKEND,
): NextCacheBackend {
  const normalized = value?.trim().toLowerCase() || "memory";
  if (normalized === "memory" || normalized === "redis") return normalized;
  throw new Error("SUNRISE_NEXT_CACHE_BACKEND must be memory or redis");
}

export function getRedisKeyPrefix(
  value = process.env.SUNRISE_REDIS_KEY_PREFIX,
) {
  const normalized = value?.trim() || "sunrise";
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error(
      "SUNRISE_REDIS_KEY_PREFIX may contain only letters, digits, dots, underscores, and hyphens",
    );
  }
  return normalized;
}

export function getRedisCommandTimeoutMs(
  value = process.env.SUNRISE_REDIS_COMMAND_TIMEOUT_MS,
) {
  const normalized = value?.trim();
  if (!normalized) return 2_000;
  const timeout = Number(normalized);
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 30_000) {
    throw new Error(
      "SUNRISE_REDIS_COMMAND_TIMEOUT_MS must be an integer from 100 to 30000",
    );
  }
  return timeout;
}

export function getRedisUrl(value = process.env.SUNRISE_REDIS_URL) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error("SUNRISE_REDIS_URL is required by Redis-backed features");
  }

  const parsed = new URL(normalized);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error("SUNRISE_REDIS_URL must use redis:// or rediss://");
  }
  return normalized;
}

export function getRedisCredentials(
  usernameValue = process.env.SUNRISE_REDIS_USERNAME,
  passwordValue = process.env.SUNRISE_REDIS_PASSWORD,
) {
  const username = usernameValue?.trim() || undefined;
  const password = passwordValue || undefined;
  if (username && !password) {
    throw new Error(
      "SUNRISE_REDIS_PASSWORD is required when SUNRISE_REDIS_USERNAME is set",
    );
  }
  return {
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
  };
}

export function getRedisCa(
  url: string,
  pathValue = process.env.SUNRISE_REDIS_CA_FILE,
  readFile: (path: string) => Buffer = readFileSync,
) {
  const path = pathValue?.trim();
  if (!path) return undefined;
  if (new URL(url).protocol !== "rediss:") {
    throw new Error(
      "SUNRISE_REDIS_CA_FILE requires a rediss:// SUNRISE_REDIS_URL",
    );
  }

  try {
    return readFile(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read SUNRISE_REDIS_CA_FILE: ${reason}`);
  }
}

function clearClient(client: RedisClientType) {
  if (state.client === client) state.client = undefined;
  state.connecting = undefined;
  if (client.isOpen) client.destroy();
}

export async function getRedisClient(): Promise<RedisClientType> {
  if (state.client?.isReady) return state.client;
  if (state.connecting) return state.connecting;

  if (state.client) clearClient(state.client);

  const url = getRedisUrl();
  const ca = getRedisCa(url);
  const client = createClient({
    url,
    ...getRedisCredentials(),
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 1_500,
      reconnectStrategy: false,
      ...(ca ? { tls: true as const, ca } : {}),
    },
  });
  state.client = client;
  client.on("error", (error) => {
    console.error("[redis] connection error:", error.message);
  });

  state.connecting = client
    .connect()
    .then(() => {
      state.connecting = undefined;
      return client;
    })
    .catch((error) => {
      clearClient(client);
      throw error;
    });

  return state.connecting;
}

export async function runRedisCommand<T>(
  command: (client: RedisClientType) => Promise<T>,
  maximumTimeoutMs?: number,
): Promise<T> {
  const client = await getRedisClient();
  const configuredTimeoutMs = getRedisCommandTimeoutMs();
  const timeoutMs =
    maximumTimeoutMs === undefined
      ? configuredTimeoutMs
      : Math.min(configuredTimeoutMs, maximumTimeoutMs);
  const abortController = new AbortController();
  const bounded = client.withAbortSignal(
    abortController.signal,
  ) as RedisClientType;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Redis command timed out after ${timeoutMs}ms`));
      abortController.abort();

      // node-redis cannot remove a command once it is waiting for a socket
      // reply. Closing the connection rejects all in-flight work and ensures a
      // paused or partitioned Redis cannot pin a Sunrise request forever.
      clearClient(client);
    }, timeoutMs);
  });

  try {
    return await Promise.race([command(bounded), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function pingRedis() {
  const startedAt = performance.now();
  const response = await runRedisCommand((client) => client.ping());
  if (response !== "PONG") throw new Error("Redis did not return PONG");
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

export async function closeRedisForTests() {
  const client = state.client;
  state.client = undefined;
  state.connecting = undefined;
  if (client?.isOpen) client.destroy();
}
