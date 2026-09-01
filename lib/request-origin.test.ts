import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "@/lib/request-origin";

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
