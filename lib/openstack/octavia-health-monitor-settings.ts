import { z } from "zod";

import type { OctaviaHealthMonitor, OctaviaPool } from "@/types/openstack";

export const HEALTH_MONITOR_TYPES = ["HTTP", "TCP"] as const;
export const HEALTH_MONITOR_HTTP_METHODS = [
  "GET",
  "HEAD",
  "OPTIONS",
  "CONNECT",
  "DELETE",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
] as const;
export const HEALTH_MONITOR_MAX_SECONDS = 2_147_483;
export const HEALTH_MONITOR_MAX_RETRIES = 10;
export const HEALTH_MONITOR_MAX_PATH = 2048;
export const HEALTH_MONITOR_MAX_CODES = 64;

export function healthMonitorTypeForPool(pool: Pick<OctaviaPool, "protocol">) {
  return HEALTH_MONITOR_TYPES.find((type) => type === pool.protocol);
}

export function healthMonitorBelongsToPool(
  monitor: Pick<OctaviaHealthMonitor, "pools">,
  poolId: string,
) {
  return (
    Array.isArray(monitor.pools) &&
    monitor.pools.length === 1 &&
    monitor.pools[0]?.id === poolId
  );
}

export function canChangeHealthMonitor(
  pool: OctaviaPool,
  monitor?: OctaviaHealthMonitor,
  deleting = false,
) {
  const type = healthMonitorTypeForPool(pool);
  if (!type || pool.provisioning_status !== "ACTIVE") return false;
  if (!monitor) return pool.healthmonitor_id == null;
  return (
    pool.healthmonitor_id === monitor.id &&
    healthMonitorBelongsToPool(monitor, pool.id) &&
    monitor.type === type &&
    (monitor.provisioning_status === "ACTIVE" ||
      (deleting && monitor.provisioning_status === "ERROR"))
  );
}

function validCodes(value: string) {
  const validCode = (code: string) => /^[1-5]\d{2}$/.test(code);
  if (value.includes("-")) {
    const range = value.split("-");
    return (
      range.length === 2 &&
      range.every(validCode) &&
      Number(range[0]) <= Number(range[1])
    );
  }
  return value.split(/ *, */).every(validCode);
}

const monitorFields = z.object({
  name: z.string().max(255),
  admin_state_up: z.boolean(),
  delay: z.number().int(),
  timeout: z.number().int(),
  max_retries: z.number().int(),
  max_retries_down: z.number().int(),
});
const httpFields = z.object({
  http_method: z.enum(HEALTH_MONITOR_HTTP_METHODS),
  url_path: z.string(),
  expected_codes: z.string(),
});

const secondsSchema = z.number().int().min(1).max(HEALTH_MONITOR_MAX_SECONDS);
const retrySchema = z.number().int().min(1).max(HEALTH_MONITOR_MAX_RETRIES);
const writableFields = monitorFields.extend({
  delay: secondsSchema,
  timeout: secondsSchema,
  max_retries: retrySchema,
  max_retries_down: retrySchema,
});

export const healthMonitorSettingsSchema = z
  .discriminatedUnion("type", [
    writableFields
      .extend({
        type: z.literal("TCP"),
      })
      .strict(),
    writableFields
      .extend({
        type: z.literal("HTTP"),
        ...httpFields.shape,
        url_path: z
          .string()
          .max(HEALTH_MONITOR_MAX_PATH)
          .refine(
            (value) =>
              /^\/(?!\/)(?:[-A-Za-z0-9._~!&()*+,;=:@/?]|%[0-9a-f]{2})*$/i.test(
                value,
              ) && !/\s/.test(value),
            "Enter a path beginning with /, without spaces or a host.",
          ),
        expected_codes: z
          .string()
          .max(HEALTH_MONITOR_MAX_CODES)
          .refine(
            (value) => !/[^\d, -]/.test(value) && validCodes(value),
            "Enter a status code, a comma-separated list, or an ascending range.",
          ),
      })
      .strict(),
  ])
  .refine(({ timeout, delay }) => timeout < delay, {
    path: ["timeout"],
    message: "The timeout must be shorter than the interval.",
  });

export const healthMonitorSnapshotSchema = z.discriminatedUnion("type", [
  monitorFields.extend({ type: z.literal("TCP") }),
  monitorFields.extend({ type: z.literal("HTTP"), ...httpFields.shape }),
]);

export type HealthMonitorSettings = z.infer<typeof healthMonitorSnapshotSchema>;

export function readHealthMonitorSettings(monitor: OctaviaHealthMonitor) {
  const parsed = healthMonitorSnapshotSchema.safeParse(monitor);
  return parsed.success ? parsed.data : null;
}

export function changedHealthMonitorFields(
  before: HealthMonitorSettings,
  after: HealthMonitorSettings,
) {
  const baseline: Partial<Record<string, unknown>> = before;
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) => key !== "type" && value !== baseline[key],
    ),
  );
}
