import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  elapsedSeconds,
  metricsRegistry,
  observeAuthRefresh,
  observeOpenStackRequest,
  observeRedisCommand,
  observeRedisReadiness,
  observeRgwRequest,
  observeSessionLoad,
  openStackOutcome,
  resetMetricsForTests,
} from "@/lib/metrics";

describe("Sunrise metrics", () => {
  beforeEach(() => {
    vi.stubEnv("SUNRISE_METRICS_ENABLED", "true");
    vi.stubEnv("SUNRISE_DEPLOYMENT_ID", "revision-123");
    resetMetricsForTests();
  });

  afterEach(() => {
    resetMetricsForTests();
    vi.unstubAllEnvs();
  });

  it("records bounded application metrics", async () => {
    observeOpenStackRequest({
      durationSeconds: 0.12,
      method: "GET",
      outcome: "client_error",
      serviceType: "compute",
      status: 404,
    });
    observeRedisCommand({
      connectionKind: "shared",
      durationSeconds: 0.01,
      outcome: "success",
    });
    observeRedisReadiness({ durationSeconds: 0.02, outcome: "success" });
    observeRgwRequest({
      api: "s3",
      durationSeconds: 0.08,
      operation: "ListBuckets",
      outcome: "success",
      status: 200,
    });
    observeSessionLoad({
      backend: "redis",
      durationSeconds: 0.03,
      state: "authenticated",
    });
    observeAuthRefresh({
      durationSeconds: 0.4,
      outcome: "reauthenticate",
      target: "keystone",
    });

    const output = await metricsRegistry()!.metrics();
    expect(output).toContain(
      'sunrise_build_info{deployment_id="revision-123"} 1',
    );
    expect(output).toContain(
      'sunrise_openstack_requests_total{method="GET",outcome="client_error",service_type="compute",status_code="404"} 1',
    );
    expect(output).toContain(
      'sunrise_redis_commands_total{connection_kind="shared",outcome="success"} 1',
    );
    expect(output).toContain("sunrise_redis_readiness 1");
    expect(output).toContain(
      'sunrise_rgw_requests_total{api="s3",operation="ListBuckets",outcome="success",status_code="200"} 1',
    );
    expect(output).toContain(
      'sunrise_session_loads_total{backend="redis",state="authenticated"} 1',
    );
    expect(output).toContain(
      'sunrise_auth_refreshes_total{outcome="reauthenticate",target="keystone"} 1',
    );
  });

  it("does not initialize metrics while collection is disabled", () => {
    vi.stubEnv("SUNRISE_METRICS_ENABLED", "false");
    resetMetricsForTests();

    observeRedisReadiness({ durationSeconds: 0.1, outcome: "error" });

    expect(metricsRegistry()).toBeUndefined();
  });

  it("classifies OpenStack responses without resource-specific labels", () => {
    expect(openStackOutcome()).toBe("network_error");
    expect(openStackOutcome(204)).toBe("success");
    expect(openStackOutcome(409)).toBe("client_error");
    expect(openStackOutcome(503)).toBe("server_error");
    expect(elapsedSeconds(performance.now() + 100)).toBe(0);
  });
});
