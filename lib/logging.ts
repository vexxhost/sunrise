export type LogFormat = "json" | "pretty";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const STRUCTURAL_FIELDS = new Set(["timestamp", "level", "component", "event"]);
const IMMUTABLE_FIELDS = new Set([...STRUCTURAL_FIELDS, "deploymentId"]);
const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 100;
const MAX_STRING_LENGTH = 2_000;

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string) {
  const normalized = normalizedKey(key);
  return [
    "authorization",
    "body",
    "cookie",
    "credential",
    "header",
    "password",
    "passwd",
    "payload",
    "privatekey",
    "query",
    "secret",
    "setcookie",
    "token",
    "url",
  ].some((fragment) => normalized.includes(fragment));
}

function scrubString(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\b(?:https?|rediss?):\/\/[^\s"'<>]+/gi, "[URL]")
    .slice(0, MAX_STRING_LENGTH);
}

function sanitizeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol" || typeof value === "function") {
    return `[${typeof value}]`;
  }
  if (depth >= MAX_DEPTH) return "[MaxDepth]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      ...(value.cause === undefined
        ? {}
        : { cause: sanitizeValue(value.cause, seen, depth + 1) }),
    };
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeValue(entry, seen, depth + 1));
  }

  const sanitized: LogFields = {};
  for (const [key, entry] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    const sanitizedEntry = isSensitiveKey(key)
      ? REDACTED
      : sanitizeValue(entry, seen, depth + 1);
    if (sanitizedEntry !== undefined) sanitized[key] = sanitizedEntry;
  }
  return sanitized;
}

function sanitizeFields(fields: LogFields) {
  const sanitized = sanitizeValue(fields, new WeakSet(), 0) as LogFields;
  for (const field of IMMUTABLE_FIELDS) delete sanitized[field];
  return sanitized;
}

export function parseLogLevel(value?: string): LogLevel {
  const normalized = value?.trim().toLowerCase() || "info";
  if (normalized === "debug" || normalized === "info") return normalized;
  if (normalized === "warn" || normalized === "error") return normalized;
  throw new Error("SUNRISE_LOG_LEVEL must be one of: debug, info, warn, error");
}

export function parseLogFormat(
  value?: string,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
): LogFormat {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return nodeEnvironment === "production" ? "json" : "pretty";
  if (normalized === "json" || normalized === "pretty") return normalized;
  throw new Error("SUNRISE_LOG_FORMAT must be one of: json, pretty");
}

function prettyValue(value: unknown) {
  if (typeof value === "string" && !/[\s=]/.test(value)) return value;
  return JSON.stringify(value);
}

function writeLog(level: LogLevel, record: LogFields) {
  const output =
    parseLogFormat(process.env.SUNRISE_LOG_FORMAT) === "json"
      ? JSON.stringify(record)
      : [
          `[${record.timestamp}]`,
          level.toUpperCase(),
          record.component,
          record.event,
          ...Object.entries(record)
            .filter(([key]) => !STRUCTURAL_FIELDS.has(key))
            .map(([key, value]) => `${key}=${prettyValue(value)}`),
        ].join(" ");

  console[level](output);
}

export function createLogger(component: string, baseFields: LogFields = {}) {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(component)) {
    throw new Error(
      "Logger component names may contain lowercase letters, digits, dots, and hyphens",
    );
  }
  const sanitizedBase = sanitizeFields(baseFields);

  const log = (level: LogLevel, event: string, fields: LogFields = {}) => {
    if (
      LEVEL_PRIORITY[level] <
      LEVEL_PRIORITY[parseLogLevel(process.env.SUNRISE_LOG_LEVEL)]
    ) {
      return;
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(event)) {
      throw new Error(
        "Log event names may contain lowercase letters, digits, dots, underscores, and hyphens",
      );
    }
    const deploymentId = process.env.SUNRISE_DEPLOYMENT_ID?.trim();
    writeLog(level, {
      timestamp: new Date().toISOString(),
      level,
      component,
      event,
      ...(deploymentId ? { deploymentId } : {}),
      ...sanitizedBase,
      ...sanitizeFields(fields),
    });
  };

  return {
    debug: (event: string, fields?: LogFields) => log("debug", event, fields),
    info: (event: string, fields?: LogFields) => log("info", event, fields),
    warn: (event: string, fields?: LogFields) => log("warn", event, fields),
    error: (event: string, fields?: LogFields) => log("error", event, fields),
  };
}
