import { randomUUID } from "node:crypto";
import {
  getIronSession,
  sealData,
  unsealData,
  type CookieStore,
  type IronSession,
  type SessionOptions,
} from "iron-session";
import { getSessionLifetimePolicy } from "@/lib/session-lifetime";
import type { SunriseSession } from "@/lib/session";
import { getRedisKeyPrefix, runRedisCommand } from "@/lib/redis";

type StoredSessionReference = {
  backend?: "redis";
  key?: string;
};

type StoredSessionRecord = {
  version: number;
  data: SunriseSession;
};

export const REDIS_SESSION_MAX_SAVE_ATTEMPTS = 4;
const PRE_AUTH_SESSION_TTL_SECONDS = 10 * 60;

type RedisSessionSaveOptions = {
  beforeConflictRetry?: () => Promise<void>;
  maximumCommandTimeoutMs?: number;
};

const SAVE_SESSION_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return -1
end
local current = redis.call("HGET", KEYS[1], "version")
if ARGV[1] == "" then
  if current then return 0 end
elseif current ~= ARGV[1] then
  return 0
end
redis.call("HSET", KEYS[1], "version", ARGV[2], "data", ARGV[3])
redis.call("EXPIRE", KEYS[1], ARGV[4])
return 1
`;

const REVOKE_SESSION_SCRIPT = `
redis.call("SET", KEYS[2], "1", "EX", ARGV[1])
redis.call("DEL", KEYS[1])
return 1
`;

const destroyers = new WeakMap<object, () => Promise<void>>();
const rotators = new WeakMap<object, () => Promise<void>>();
const reloaders = new WeakMap<object, () => Promise<void>>();
const savers = new WeakMap<
  object,
  (options?: RedisSessionSaveOptions) => Promise<void>
>();

function sessionKey(id: string) {
  return `${getRedisKeyPrefix()}:session:{${id}}`;
}

function revokedKey(id: string) {
  return `${getRedisKeyPrefix()}:session-revoked:{${id}}`;
}

export function storedSessionTtlSeconds(
  data: SunriseSession,
  now = Date.now(),
) {
  const { absoluteTimeoutSeconds, absoluteTimeoutMs } =
    getSessionLifetimePolicy();
  if (!data.sessionSignedInAt) {
    return Math.min(absoluteTimeoutSeconds, PRE_AUTH_SESSION_TTL_SECONDS);
  }
  return Math.max(
    1,
    Math.ceil((data.sessionSignedInAt + absoluteTimeoutMs - now) / 1_000),
  );
}

export function mergeStoredSession(
  current: SunriseSession,
  source: SunriseSession,
  changed: ReadonlySet<keyof SunriseSession>,
  deleted: ReadonlySet<keyof SunriseSession>,
): SunriseSession {
  const merged = { ...current };
  for (const key of changed) {
    const value = source[key];
    if (value === undefined) delete merged[key];
    else Object.assign(merged, { [key]: value });
  }
  for (const key of deleted) delete merged[key];
  return merged;
}

function sessionPassword() {
  const value = process.env.SUNRISE_SESSION_SECRET;
  if (!value) throw new Error("SUNRISE_SESSION_SECRET is required");
  return value;
}

async function readStoredSession(
  id: string,
  maximumCommandTimeoutMs?: number,
): Promise<StoredSessionRecord | null> {
  const record = await runRedisCommand((client) =>
    client.hGetAll(sessionKey(id)),
    maximumCommandTimeoutMs,
  );
  if (!record.version || !record.data) return null;

  const version = Number(record.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Stored Sunrise session has an invalid version");
  }

  const { absoluteTimeoutSeconds } = getSessionLifetimePolicy();
  const data = await unsealData<SunriseSession>(record.data, {
    password: sessionPassword(),
    ttl: absoluteTimeoutSeconds + 60,
  });
  return { version, data };
}

function enumerableSessionData(session: SunriseSession): SunriseSession {
  return Object.fromEntries(
    Object.entries(session).filter(([, value]) => value !== undefined),
  ) as SunriseSession;
}

function replaceSessionData(target: SunriseSession, source: SunriseSession) {
  for (const key of Object.keys(target)) {
    delete target[key as keyof SunriseSession];
  }
  Object.assign(target, source);
}

async function persistStoredSession(
  id: string,
  expectedVersion: number | null,
  data: SunriseSession,
  maximumCommandTimeoutMs?: number,
) {
  const nextVersion = (expectedVersion ?? 0) + 1;
  const ttl = storedSessionTtlSeconds(data);
  const sealed = await sealData(enumerableSessionData(data), {
    password: sessionPassword(),
    ttl: ttl + 60,
  });
  const result = await runRedisCommand((client) =>
    client.eval(SAVE_SESSION_SCRIPT, {
      keys: [sessionKey(id), revokedKey(id)],
      arguments: [
        expectedVersion?.toString() ?? "",
        nextVersion.toString(),
        sealed,
        ttl.toString(),
      ],
    }),
    maximumCommandTimeoutMs,
  );
  return Number(result) as -1 | 0 | 1;
}

async function revokeStoredSession(id: string) {
  const { absoluteTimeoutSeconds } = getSessionLifetimePolicy();
  await runRedisCommand((client) =>
    client.eval(REVOKE_SESSION_SCRIPT, {
      keys: [sessionKey(id), revokedKey(id)],
      arguments: [absoluteTimeoutSeconds.toString()],
    }),
  );
}

function referenceData(
  reference: IronSession<StoredSessionReference & SunriseSession>,
) {
  return Object.fromEntries(
    Object.entries(reference).filter(
      ([key, value]) =>
        key !== "backend" && key !== "key" && value !== undefined,
    ),
  ) as SunriseSession;
}

function clearLegacyReferenceData(
  reference: IronSession<StoredSessionReference & SunriseSession>,
) {
  for (const key of Object.keys(reference)) {
    if (key !== "backend" && key !== "key") {
      delete reference[key as keyof typeof reference];
    }
  }
}

export async function getRedisSession(
  cookieStore: CookieStore,
  options: SessionOptions,
): Promise<IronSession<SunriseSession>> {
  const reference = await getIronSession<
    StoredSessionReference & SunriseSession
  >(cookieStore, options);
  const hasStoredReference = reference.backend === "redis";
  let id = hasStoredReference ? reference.key : undefined;
  let loaded = id ? await readStoredSession(id) : null;
  const missingStoredReference = hasStoredReference && !loaded;
  if (missingStoredReference) {
    id = undefined;
    delete reference.backend;
    delete reference.key;
  }
  const initialData =
    loaded?.data ?? (missingStoredReference ? {} : referenceData(reference));
  const target = { ...initialData } as SunriseSession;
  const changed = new Set<keyof SunriseSession>();
  const deleted = new Set<keyof SunriseSession>();
  let destroyed = false;

  const session = new Proxy(target, {
    set(object, property, value) {
      if (typeof property === "string") {
        const key = property as keyof SunriseSession;
        changed.add(key);
        if (value === undefined) deleted.add(key);
        else deleted.delete(key);
      }
      return Reflect.set(object, property, value, object);
    },
    deleteProperty(object, property) {
      if (typeof property === "string") {
        const key = property as keyof SunriseSession;
        changed.delete(key);
        deleted.add(key);
      }
      return Reflect.deleteProperty(object, property);
    },
  }) as IronSession<SunriseSession>;

  async function save(options: RedisSessionSaveOptions = {}) {
    if (destroyed) {
      throw new Error("Cannot save a destroyed Sunrise session");
    }
    id ??= randomUUID();

    for (
      let attempt = 0;
      attempt < REDIS_SESSION_MAX_SAVE_ATTEMPTS;
      attempt += 1
    ) {
      const current = loaded?.data ?? {};
      const candidate = loaded
        ? mergeStoredSession(current, target, changed, deleted)
        : enumerableSessionData(target);
      const result = await persistStoredSession(
        id,
        loaded?.version ?? null,
        candidate,
        options.maximumCommandTimeoutMs,
      );
      if (result === -1) {
        throw new Error("Cannot save a revoked Sunrise session");
      }
      if (result === 1) {
        loaded = {
          version: (loaded?.version ?? 0) + 1,
          data: candidate,
        };
        replaceSessionData(target, candidate);
        changed.clear();
        deleted.clear();
        clearLegacyReferenceData(reference);
        reference.backend = "redis";
        reference.key = id;
        await reference.save();
        return;
      }
      await options.beforeConflictRetry?.();
      loaded = await readStoredSession(id, options.maximumCommandTimeoutMs);
      if (!loaded) {
        throw new Error("Cannot save a missing or revoked Sunrise session");
      }
    }

    throw new Error("Sunrise session changed too many times while saving");
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const key of Object.keys(target))
      delete target[key as keyof SunriseSession];
    reference.destroy();
  }

  Object.defineProperties(target, {
    save: { value: () => save() },
    destroy: { value: destroy },
    updateConfig: { value: reference.updateConfig.bind(reference) },
  });
  savers.set(session, save);

  reloaders.set(session, async () => {
    if (destroyed || !id) {
      throw new Error("Cannot reload a missing or destroyed Sunrise session");
    }
    const current = await readStoredSession(id);
    if (!current) {
      throw new Error("Cannot reload a missing or revoked Sunrise session");
    }
    const merged = mergeStoredSession(current.data, target, changed, deleted);
    replaceSessionData(target, merged);
    loaded = current;
  });

  let rotating: Promise<void> | undefined;
  rotators.set(session, () => {
    if (!rotating) {
      rotating = (async () => {
        const storedId = id;
        if (!storedId) return;
        await revokeStoredSession(storedId);
        id = randomUUID();
        loaded = null;
      })().finally(() => {
        rotating = undefined;
      });
    }
    return rotating;
  });
  destroyers.set(session, async () => {
    const storedId = id;
    if (storedId) await revokeStoredSession(storedId);
    destroy();
  });
  return session;
}

export async function rotateRedisSession(session: IronSession<SunriseSession>) {
  await rotators.get(session)?.();
}

export async function reloadRedisSession(session: IronSession<SunriseSession>) {
  const reload = reloaders.get(session);
  if (reload) await reload();
}

export async function saveRedisSession(
  session: IronSession<SunriseSession>,
  options: RedisSessionSaveOptions = {},
) {
  const save = savers.get(session);
  if (save) {
    await save(options);
    return;
  }
  await session.save();
}

export async function destroyRedisSession(
  session: IronSession<SunriseSession>,
) {
  const destroy = destroyers.get(session);
  if (!destroy) {
    session.destroy();
    return;
  }
  await destroy();
}
