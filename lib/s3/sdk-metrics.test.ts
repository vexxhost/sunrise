import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { metricsRegistry, resetMetricsForTests } from "@/lib/metrics";
import { instrumentRgwClient } from "@/lib/s3/sdk-metrics";

type TestMiddlewareArguments<Input extends object> = {
  input: Input;
  request?: unknown;
};
type TestMiddlewareResult<Output extends object> = {
  output: Output;
  response: unknown;
};
type TestMiddlewareHandler<Input extends object, Output extends object> = (
  args: TestMiddlewareArguments<Input>,
) => Promise<TestMiddlewareResult<Output>>;
type TestMiddleware = <Input extends object, Output extends object>(
  next: TestMiddlewareHandler<Input, Output>,
  context: { commandName?: string },
) => TestMiddlewareHandler<Input, Output>;
type TestMiddlewareOptions = {
  name?: string;
  relation: "after";
  toMiddleware: string;
};

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
    let middleware: TestMiddleware | undefined;
    let options: TestMiddlewareOptions | undefined;
    const client = {
      middlewareStack: {
        addRelativeTo(
          candidate: typeof middleware,
          candidateOptions: TestMiddlewareOptions,
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
        response: {},
      }),
      { commandName: "ListObjectsV2Command" },
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
    const handler = middleware(vi.fn().mockRejectedValue(error), {
      commandName: "GetBucketPolicyCommand",
    });

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
