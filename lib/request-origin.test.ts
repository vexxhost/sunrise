import { describe, expect, it } from "vitest";

import {
  getRequestRedirectOrigin,
  getTrustedRequestOrigin,
  isSameOriginRequest,
} from "@/lib/request-origin";

function headers(values: Record<string, string>) {
  return new Headers(values);
}

describe("isSameOriginRequest", () => {
  it("accepts the external origin reported by a reverse proxy", () => {
    expect(
      isSameOriginRequest(
        headers({
          host: "localhost:3000",
          origin: "http://localhost:9990",
          "x-forwarded-host": "localhost:9990",
          "x-forwarded-proto": "http",
        }),
        "http://localhost:3000",
      ),
    ).toBe(true);
  });

  it("rejects cross-origin and protocol-mismatched requests", () => {
    expect(
      isSameOriginRequest(
        headers({ host: "sunrise.example", origin: "https://evil.example" }),
        "https://sunrise.example",
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        headers({ host: "sunrise.example", origin: "http://sunrise.example" }),
        "https://sunrise.example",
      ),
    ).toBe(false);
  });

  it("allows requests without an Origin header", () => {
    expect(
      isSameOriginRequest(
        headers({ host: "sunrise.example" }),
        "https://sunrise.example",
      ),
    ).toBe(true);
  });
});

describe("getTrustedRequestOrigin", () => {
  it("trusts the canonical dashboard origin", () => {
    expect(
      getTrustedRequestOrigin(
        headers({
          host: "dashboard.example.test",
          "x-forwarded-proto": "https",
        }),
        "https://dashboard.example.test",
      ),
    ).toBe("https://dashboard.example.test");
  });

  it("uses an explicitly allowed request origin", () => {
    expect(
      getTrustedRequestOrigin(
        headers({ host: "localhost:9091" }),
        "http://localhost:9090",
        "http://localhost:9091",
      ),
    ).toBe("http://localhost:9091");
  });

  it("rejects a configured origin on another hostname", () => {
    expect(
      getTrustedRequestOrigin(
        headers({
          host: "sunrise.example.test:3000",
          "x-forwarded-host": "cloud.example.test",
          "x-forwarded-proto": "https",
        }),
        "https://sunrise.example.test:3000",
        "https://cloud.example.test",
      ),
    ).toBe("https://sunrise.example.test:3000");
  });

  it("rejects a configured origin using another scheme", () => {
    expect(
      getTrustedRequestOrigin(
        headers({
          host: "localhost:9443",
          "x-forwarded-proto": "https",
        }),
        "http://localhost:9090",
        "https://localhost:9443",
      ),
    ).toBe("http://localhost:9090");
  });

  it("accepts an allowed origin with an explicit default port", () => {
    expect(
      getTrustedRequestOrigin(
        headers({
          host: "sunrise:3000",
          "x-forwarded-host": "dashboard.example.test:443",
          "x-forwarded-proto": "https",
        }),
        "https://dashboard.example.test:8443",
        "https://dashboard.example.test",
      ),
    ).toBe("https://dashboard.example.test");
  });

  it("rejects an unlisted request origin", () => {
    expect(
      getTrustedRequestOrigin(
        headers({
          host: "dashboard.example.test",
          "x-forwarded-host": "attacker.example.test",
          "x-forwarded-proto": "https",
        }),
        "https://dashboard.example.test",
      ),
    ).toBe("https://dashboard.example.test");
  });

  it("rejects a host value containing URL components", () => {
    expect(
      getTrustedRequestOrigin(
        headers({
          host: "dashboard.example.test/path",
          "x-forwarded-proto": "https",
        }),
        "https://dashboard.example.test:8443/console",
        "https://dashboard.example.test",
      ),
    ).toBe("https://dashboard.example.test:8443");
  });

  it("falls back when the request protocol is not HTTP", () => {
    expect(
      getTrustedRequestOrigin(
        headers({
          host: "dashboard.example.test:9443",
          "x-forwarded-proto": "file",
        }),
        "https://dashboard.example.test/console",
        "https://dashboard.example.test:9443",
      ),
    ).toBe("https://dashboard.example.test");
  });
});

describe("getRequestRedirectOrigin", () => {
  it("uses the configured dashboard when an upstream request URL is internal", () => {
    expect(
      getRequestRedirectOrigin(
        new Request("http://0.0.0.0:3000/sign-in/demo"),
        "https://sunrise.example.test",
      ),
    ).toBe("https://sunrise.example.test");
  });

  it("falls back to the request origin when no dashboard is configured", () => {
    expect(
      getRequestRedirectOrigin(
        new Request("http://localhost:9990/sign-in/demo"),
      ),
    ).toBe("http://localhost:9990");
  });
});
