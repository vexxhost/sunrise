import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createLogger, parseLogFormat, parseLogLevel } from "@/lib/logging";

describe("structured logger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:34:56.000Z"));
    vi.stubEnv("SUNRISE_LOG_FORMAT", "json");
    vi.stubEnv("SUNRISE_LOG_LEVEL", "debug");
    vi.stubEnv("SUNRISE_DEPLOYMENT_ID", "revision-123");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("writes one-line JSON records with stable context", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    createLogger("openstack.request", { serviceType: "compute" }).info(
      "request.completed",
      { status: 200 },
    );

    expect(info).toHaveBeenCalledOnce();
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toEqual({
      timestamp: "2026-10-29T12:34:56.000Z",
      level: "info",
      component: "openstack.request",
      event: "request.completed",
      deploymentId: "revision-123",
      serviceType: "compute",
      status: 200,
    });
  });

  it("redacts nested secrets and scrubs credential-shaped strings", () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    createLogger("auth").error("refresh.failed", {
      authorization: "Bearer access-token",
      error: new Error(
        "rejected eyJhbGciOiJIUzI1NiJ9.payload.signature at https://identity.example.test/v3",
      ),
      nested: { clientSecret: "secret", safe: "visible" },
      circular,
    });

    const record = JSON.parse(String(errorLog.mock.calls[0]?.[0]));
    expect(record.authorization).toBe("[REDACTED]");
    expect(record.nested).toEqual({
      clientSecret: "[REDACTED]",
      safe: "visible",
    });
    expect(record.error).toEqual({
      name: "Error",
      message: "rejected [REDACTED] at [URL]",
    });
    expect(record.circular.self).toBe("[Circular]");
  });

  it("omits undefined fields from structured records", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    createLogger("runtime").info("startup.ready", {
      optionalDetail: undefined,
      status: "ready",
    });

    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).not.toHaveProperty(
      "optionalDetail",
    );
  });

  it("filters records below the configured level", () => {
    vi.stubEnv("SUNRISE_LOG_LEVEL", "warn");
    const debug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logger = createLogger("runtime");

    logger.debug("details");
    logger.warn("degraded");

    expect(debug).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("uses readable output outside production", () => {
    vi.stubEnv("SUNRISE_LOG_FORMAT", "pretty");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    createLogger("runtime").info("startup.ready", { replicaCount: 2 });

    expect(info).toHaveBeenCalledWith(
      "[2026-10-29T12:34:56.000Z] INFO runtime startup.ready deploymentId=revision-123 replicaCount=2",
    );
  });

  it("validates logger configuration", () => {
    expect(parseLogFormat(undefined, "production")).toBe("json");
    expect(parseLogFormat(undefined, "development")).toBe("pretty");
    expect(parseLogLevel(" WARN ")).toBe("warn");
    expect(() => parseLogFormat("xml")).toThrow("SUNRISE_LOG_FORMAT");
    expect(() => parseLogLevel("verbose")).toThrow("SUNRISE_LOG_LEVEL");
  });
});
