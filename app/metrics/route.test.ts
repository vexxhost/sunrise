import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { resetMetricsForTests } from "@/lib/metrics";

const token = "metrics-token-with-at-least-32-characters";

describe("metrics route", () => {
  beforeEach(() => {
    vi.stubEnv("SUNRISE_METRICS_ENABLED", "true");
    vi.stubEnv("SUNRISE_METRICS_BEARER_TOKEN", token);
    resetMetricsForTests();
  });

  afterEach(() => {
    resetMetricsForTests();
    vi.unstubAllEnvs();
  });

  it("returns Prometheus metrics to an authorized scraper", async () => {
    const response = await GET(
      new Request("https://sunrise.example.test/metrics", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toContain("sunrise_build_info");
  });

  it("rejects missing or incorrect bearer credentials", async () => {
    const response = await GET(
      new Request("https://sunrise.example.test/metrics", {
        headers: { Authorization: "Bearer incorrect-token" },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="Sunrise metrics"',
    );
  });

  it("does not expose a disabled metrics endpoint", async () => {
    vi.stubEnv("SUNRISE_METRICS_ENABLED", "false");

    const response = await GET(
      new Request("https://sunrise.example.test/metrics"),
    );

    expect(response.status).toBe(404);
  });
});
