export const DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60;
export const DEFAULT_SESSION_ABSOLUTE_TIMEOUT_SECONDS = 8 * 60 * 60;
export const SESSION_ACTIVITY_INTERVAL_MS = 60_000;
export const SESSION_EXPIRY_NOTICE_COOKIE = "sunrise-session-expiry";

export type SessionExpiryReason = "idle" | "absolute" | "policy";

export type SessionLifetimeData = {
  sessionSignedInAt?: number;
  sessionLastActivityAt?: number;
};

export type ActiveSessionLifetime = {
  status: "active";
  signedInAt: number;
  lastActivityAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
};

export type ClientSessionLifetime = ActiveSessionLifetime & {
  sessionId: string;
};

export type SessionLifetimeState =
  | { status: "uninitialized"; reason: "policy" }
  | ({ status: "expired"; reason: "idle" | "absolute" } & Omit<
      ActiveSessionLifetime,
      "status"
    >)
  | ActiveSessionLifetime;

function configuredSeconds(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 60) {
    throw new Error(`${name} must be an integer of at least 60 seconds`);
  }
  return value;
}

export function getSessionLifetimePolicy() {
  const idleTimeoutSeconds = configuredSeconds(
    "SESSION_IDLE_TIMEOUT_SECONDS",
    DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS,
  );
  const absoluteTimeoutSeconds = configuredSeconds(
    "SESSION_ABSOLUTE_TIMEOUT_SECONDS",
    DEFAULT_SESSION_ABSOLUTE_TIMEOUT_SECONDS,
  );

  if (idleTimeoutSeconds > absoluteTimeoutSeconds) {
    throw new Error(
      "SESSION_IDLE_TIMEOUT_SECONDS cannot exceed SESSION_ABSOLUTE_TIMEOUT_SECONDS",
    );
  }

  return {
    idleTimeoutSeconds,
    absoluteTimeoutSeconds,
    idleTimeoutMs: idleTimeoutSeconds * 1_000,
    absoluteTimeoutMs: absoluteTimeoutSeconds * 1_000,
  };
}

export function getSessionLifetimeState(
  data: SessionLifetimeData,
  now = Date.now(),
): SessionLifetimeState {
  const { sessionSignedInAt, sessionLastActivityAt } = data;
  if (
    !Number.isFinite(sessionSignedInAt) ||
    !Number.isFinite(sessionLastActivityAt) ||
    (sessionSignedInAt as number) <= 0 ||
    (sessionLastActivityAt as number) < (sessionSignedInAt as number)
  ) {
    return { status: "uninitialized", reason: "policy" };
  }

  const policy = getSessionLifetimePolicy();
  const signedInAt = sessionSignedInAt as number;
  const lastActivityAt = sessionLastActivityAt as number;
  const idleExpiresAt = lastActivityAt + policy.idleTimeoutMs;
  const absoluteExpiresAt = signedInAt + policy.absoluteTimeoutMs;
  const timing = {
    signedInAt,
    lastActivityAt,
    idleExpiresAt,
    absoluteExpiresAt,
  };

  if (now >= absoluteExpiresAt) {
    return { status: "expired", reason: "absolute", ...timing };
  }
  if (now >= idleExpiresAt) {
    return { status: "expired", reason: "idle", ...timing };
  }

  return { status: "active", ...timing };
}

export function sessionExpiryReason(
  data: SessionLifetimeData,
  now = Date.now(),
): SessionExpiryReason | undefined {
  const state = getSessionLifetimeState(data, now);
  return state.status === "active" ? undefined : state.reason;
}

export function parseSessionExpiryReason(
  value?: string | null,
): SessionExpiryReason | undefined {
  return value === "idle" || value === "absolute" || value === "policy"
    ? value
    : undefined;
}
