import type {
  HandlerExecutionContext,
  InitializeMiddleware,
  MetadataBearer,
} from "@smithy/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { metricsRegistry, resetMetricsForTests } from "@/lib/metrics";
import { instrumentRgwClient } from "@/lib/s3/sdk-metrics";

describe("RGW SDK metrics", () => {
  beforeEach(() => {
    vi.stubEnv("SUNRISE_METRICS_ENABLED", "true");
    resetMetricsForTests();
  });

  afterEach(() => {
    resetMetricsForTests();
    vi.unstubAllEnvs();
  });

  function captureMiddleware() {
    let middleware:
      | InitializeMiddleware<Record<string, never>, MetadataBearer>
      | undefined;
    const client = {
      middlewareStack: {
        add(candidate: typeof middleware) {
          middleware = candidate;
        },
      },
    };

    expect(instrumentRgwClient(client, "s3")).toBe(client);
    expect(middleware).toBeDefined();
    return middleware!;
  }

  it("records successful commands without resource identifiers", async () => {
    const middleware = captureMiddleware();
    const handler = middleware(
      vi.fn().mockResolvedValue({
        output: { $metadata: { httpStatusCode: 200 } },
      }),
      { commandName: "ListObjectsV2Command" } as HandlerExecutionContext,
    );

    await handler({ input: {} });

    const output = await metricsRegistry()!.metrics();
    expect(output).toContain(
      'sunrise_rgw_requests_total{api="s3",operation="ListObjectsV2",outcome="success",status_code="200"} 1',
    );
    expect(output).not.toContain("bucket-name");
  });

  it("records SDK failures and preserves the original error", async () => {
    const middleware = captureMiddleware();
    const error = Object.assign(new Error("denied"), {
      $metadata: { httpStatusCode: 403 },
    });
    const handler = middleware(
      vi.fn().mockRejectedValue(error),
      { commandName: "GetBucketPolicyCommand" } as HandlerExecutionContext,
    );

    await expect(handler({ input: {} })).rejects.toBe(error);

    expect(await metricsRegistry()!.metrics()).toContain(
      'sunrise_rgw_requests_total{api="s3",operation="GetBucketPolicy",outcome="error",status_code="403"} 1',
    );
  });
});
