import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "@prometheus-io/client";
import { metricsEnabled } from "@/lib/metrics-config";
import type { SessionBackend } from "@/lib/redis";

const DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

type OpenStackOutcome =
  | "success"
  | "redirect_error"
  | "client_error"
  | "server_error"
  | "network_error"
  | "body_error"
  | "unexpected_status";
type RedisOutcome = "success" | "error";
type RgwOutcome = "success" | "error";
type AuthRefreshOutcome =
  | "success"
  | "reauthenticate"
  | "expired"
  | "no_projects"
  | "no_role"
  | "error";
type SessionState = "anonymous" | "authenticated" | "expired" | "error";

type MetricsRuntime = {
  registry: Registry;
  openstackRequests: Counter<
    "service_type" | "method" | "outcome" | "status_code"
  >;
  openstackRequestDuration: Histogram<"service_type" | "method" | "outcome">;
  redisCommands: Counter<"connection_kind" | "outcome">;
  redisCommandDuration: Histogram<"connection_kind" | "outcome">;
  redisReadiness: Gauge;
  redisReadinessDuration: Histogram<"outcome">;
  rgwRequests: Counter<"api" | "operation" | "outcome" | "status_code">;
  rgwRequestDuration: Histogram<"api" | "operation" | "outcome">;
  sessionLoads: Counter<"backend" | "state">;
  sessionLoadDuration: Histogram<"backend" | "state">;
  authRefreshes: Counter<"target" | "outcome">;
  authRefreshDuration: Histogram<"target" | "outcome">;
};

const globalMetrics = globalThis as typeof globalThis & {
  sunriseMetricsRuntime?: MetricsRuntime;
};

function createMetricsRuntime(): MetricsRuntime {
  const registry = new Registry();
  collectDefaultMetrics({ prefix: "sunrise_", register: registry });

  const buildInfo = new Gauge({
    name: "sunrise_build_info",
    help: "Static information about the running Sunrise build.",
    labelNames: ["deployment_id"] as const,
    registers: [registry],
  });
  buildInfo.set(
    {
      deployment_id: process.env.SUNRISE_DEPLOYMENT_ID?.trim() || "unversioned",
    },
    1,
  );

  return {
    registry,
    openstackRequests: new Counter({
      name: "sunrise_openstack_requests_total",
      help: "OpenStack API requests made through the standard Sunrise request layer.",
      labelNames: ["service_type", "method", "outcome", "status_code"] as const,
      registers: [registry],
    }),
    openstackRequestDuration: new Histogram({
      name: "sunrise_openstack_request_duration_seconds",
      help: "Duration of OpenStack API requests made through the standard Sunrise request layer.",
      labelNames: ["service_type", "method", "outcome"] as const,
      buckets: DURATION_BUCKETS_SECONDS,
      registers: [registry],
    }),
    redisCommands: new Counter({
      name: "sunrise_redis_commands_total",
      help: "Redis commands executed by Sunrise.",
      labelNames: ["connection_kind", "outcome"] as const,
      registers: [registry],
    }),
    redisCommandDuration: new Histogram({
      name: "sunrise_redis_command_duration_seconds",
      help: "Duration of Redis commands executed by Sunrise.",
      labelNames: ["connection_kind", "outcome"] as const,
      buckets: DURATION_BUCKETS_SECONDS,
      registers: [registry],
    }),
    redisReadiness: new Gauge({
      name: "sunrise_redis_readiness",
      help: "Whether the most recent Redis readiness probe succeeded.",
      registers: [registry],
    }),
    redisReadinessDuration: new Histogram({
      name: "sunrise_redis_readiness_duration_seconds",
      help: "Duration of Redis readiness capability probes.",
      labelNames: ["outcome"] as const,
      buckets: DURATION_BUCKETS_SECONDS,
      registers: [registry],
    }),
    rgwRequests: new Counter({
      name: "sunrise_rgw_requests_total",
      help: "RGW API requests made by Sunrise through server-side AWS SDK clients.",
      labelNames: ["api", "operation", "outcome", "status_code"] as const,
      registers: [registry],
    }),
    rgwRequestDuration: new Histogram({
      name: "sunrise_rgw_request_duration_seconds",
      help: "Duration of RGW API requests made through server-side AWS SDK clients.",
      labelNames: ["api", "operation", "outcome"] as const,
      buckets: DURATION_BUCKETS_SECONDS,
      registers: [registry],
    }),
    sessionLoads: new Counter({
      name: "sunrise_session_loads_total",
      help: "Sunrise session loads by backend and resulting state.",
      labelNames: ["backend", "state"] as const,
      registers: [registry],
    }),
    sessionLoadDuration: new Histogram({
      name: "sunrise_session_load_duration_seconds",
      help: "Duration of Sunrise session loads.",
      labelNames: ["backend", "state"] as const,
      buckets: DURATION_BUCKETS_SECONDS,
      registers: [registry],
    }),
    authRefreshes: new Counter({
      name: "sunrise_auth_refreshes_total",
      help: "Sunrise authentication refresh attempts by target and outcome.",
      labelNames: ["target", "outcome"] as const,
      registers: [registry],
    }),
    authRefreshDuration: new Histogram({
      name: "sunrise_auth_refresh_duration_seconds",
      help: "Duration of Sunrise authentication refresh attempts.",
      labelNames: ["target", "outcome"] as const,
      buckets: DURATION_BUCKETS_SECONDS,
      registers: [registry],
    }),
  };
}

function runtime() {
  if (!metricsEnabled()) return undefined;
  globalMetrics.sunriseMetricsRuntime ??= createMetricsRuntime();
  return globalMetrics.sunriseMetricsRuntime;
}

export function elapsedSeconds(startedAt: number) {
  return Math.max(0, performance.now() - startedAt) / 1_000;
}

export function openStackOutcome(status?: number): OpenStackOutcome {
  if (status === undefined) return "network_error";
  if (status >= 200 && status < 300) return "success";
  if (status >= 300 && status < 400) return "redirect_error";
  if (status >= 400 && status < 500) return "client_error";
  if (status >= 500) return "server_error";
  return "unexpected_status";
}

export function observeOpenStackRequest(input: {
  durationSeconds: number;
  method: string;
  outcome: OpenStackOutcome;
  serviceType: string;
  status?: number;
}) {
  const metrics = runtime();
  if (!metrics) return;
  const labels = {
    method: input.method.toUpperCase(),
    outcome: input.outcome,
    service_type: input.serviceType,
  };
  metrics.openstackRequests.inc({
    ...labels,
    status_code: input.status?.toString() ?? "none",
  });
  metrics.openstackRequestDuration.observe(labels, input.durationSeconds);
}

export function observeRedisCommand(input: {
  connectionKind: "shared" | "isolated";
  durationSeconds: number;
  outcome: RedisOutcome;
}) {
  const metrics = runtime();
  if (!metrics) return;
  const labels = {
    connection_kind: input.connectionKind,
    outcome: input.outcome,
  };
  metrics.redisCommands.inc(labels);
  metrics.redisCommandDuration.observe(labels, input.durationSeconds);
}

export function observeRedisReadiness(input: {
  durationSeconds: number;
  outcome: RedisOutcome;
}) {
  const metrics = runtime();
  if (!metrics) return;
  metrics.redisReadiness.set(input.outcome === "success" ? 1 : 0);
  metrics.redisReadinessDuration.observe(
    { outcome: input.outcome },
    input.durationSeconds,
  );
}

export function observeRgwRequest(input: {
  api: "iam" | "s3" | "sts";
  durationSeconds: number;
  operation: string;
  outcome: RgwOutcome;
  status?: number;
}) {
  const metrics = runtime();
  if (!metrics) return;
  const labels = {
    api: input.api,
    operation: input.operation,
    outcome: input.outcome,
  };
  metrics.rgwRequests.inc({
    ...labels,
    status_code: input.status?.toString() ?? "none",
  });
  metrics.rgwRequestDuration.observe(labels, input.durationSeconds);
}

export function observeSessionLoad(input: {
  backend: SessionBackend;
  durationSeconds: number;
  state: SessionState;
}) {
  const metrics = runtime();
  if (!metrics) return;
  const labels = { backend: input.backend, state: input.state };
  metrics.sessionLoads.inc(labels);
  metrics.sessionLoadDuration.observe(labels, input.durationSeconds);
}

export function observeAuthRefresh(input: {
  durationSeconds: number;
  outcome: AuthRefreshOutcome;
  target: "keystone" | "rgw";
}) {
  const metrics = runtime();
  if (!metrics) return;
  const labels = { outcome: input.outcome, target: input.target };
  metrics.authRefreshes.inc(labels);
  metrics.authRefreshDuration.observe(labels, input.durationSeconds);
}

export function metricsRegistry() {
  return runtime()?.registry;
}

export function resetMetricsForTests() {
  globalMetrics.sunriseMetricsRuntime?.registry.clear();
  globalMetrics.sunriseMetricsRuntime = undefined;
}
