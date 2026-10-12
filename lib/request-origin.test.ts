import { describe, expect, it } from "vitest";

import {
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

  it("uses an allowed external host and protocol supplied by a proxy", () => {
    expect(
      getTrustedRequestOrigin(
        headers({
          host: "sunrise:3000",
          "x-forwarded-host": "cloud.example.test",
          "x-forwarded-proto": "https",
        }),
        "http://sunrise:3000",
        "https://cloud.example.test",
      ),
    ).toBe("https://cloud.example.test");
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

  it("falls back when request origin headers are malformed", () => {
    expect(
      getTrustedRequestOrigin(
        headers({
          host: "cloud.example.test/path",
          "x-forwarded-proto": "file",
        }),
        "https://dashboard.example.test/console",
      ),
    ).toBe("https://dashboard.example.test");
  });
});
