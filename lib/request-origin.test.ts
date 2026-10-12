import { describe, expect, it } from "vitest";

import { getRequestOrigin, isSameOriginRequest } from "@/lib/request-origin";

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

describe("getRequestOrigin", () => {
  it("uses the request host instead of a canonical dashboard port", () => {
    expect(
      getRequestOrigin(
        headers({ host: "localhost:9091" }),
        "http://localhost:9090",
      ),
    ).toBe("http://localhost:9091");
  });

  it("uses the external host and protocol supplied by a reverse proxy", () => {
    expect(
      getRequestOrigin(
        headers({
          host: "sunrise:3000",
          "x-forwarded-host": "cloud.example.test",
          "x-forwarded-proto": "https",
        }),
        "http://sunrise:3000",
      ),
    ).toBe("https://cloud.example.test");
  });

  it("falls back when request origin headers are malformed", () => {
    expect(
      getRequestOrigin(
        headers({
          host: "cloud.example.test/path",
          "x-forwarded-proto": "file",
        }),
        "https://dashboard.example.test/console",
      ),
    ).toBe("https://dashboard.example.test");
  });
});
