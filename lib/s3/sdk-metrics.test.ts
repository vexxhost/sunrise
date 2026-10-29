import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  FinalizeRequestMiddleware,
  HandlerExecutionContext,
  MetadataBearer,
  RelativeMiddlewareOptions,
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
      | FinalizeRequestMiddleware<Record<string, never>, MetadataBearer>
      | undefined;
    let options: RelativeMiddlewareOptions | undefined;
    const client = {
      middlewareStack: {
        addRelativeTo(
          candidate: typeof middleware,
          candidateOptions: RelativeMiddlewareOptions,
        ) {
          middleware = candidate;
          options = candidateOptions;
        },
      },
    };

    expect(instrumentRgwClient(client, "s3")).toBe(client);
    expect(middleware).toBeDefined();
    expect(options).toMatchObject({
      relation: "after",
      toMiddleware: "awsAuthMiddleware",
    });
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

    await handler({ input: {}, request: {} });

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

    await expect(handler({ input: {}, request: {} })).rejects.toBe(error);

    expect(await metricsRegistry()!.metrics()).toContain(
      'sunrise_rgw_requests_total{api="s3",operation="GetBucketPolicy",outcome="error",status_code="403"} 1',
    );
  });

  it("does not record locally presigned S3 requests", async () => {
    const client = instrumentRgwClient(
      new S3Client({
        credentials: {
          accessKeyId: "access-key",
          secretAccessKey: "secret-key",
        },
        endpoint: "https://rgw.example.test",
        forcePathStyle: true,
        region: "RegionOne",
      }),
      "s3",
    );

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: "bucket-name", Key: "object-key" }),
      { expiresIn: 60 },
    );

    expect(url).toContain("rgw.example.test/bucket-name/object-key");
    expect(await metricsRegistry()!.metrics()).not.toContain(
      "sunrise_rgw_requests_total{",
    );
  });
});
