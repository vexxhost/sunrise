import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  SUNRISE_REQUEST_ID_HEADER,
  validSunriseRequestId,
} from "@/lib/request-correlation";
import { proxy } from "./proxy";

describe("request correlation proxy", () => {
  it("replaces untrusted IDs and forwards the generated ID", () => {
    const response = proxy(
      new NextRequest("https://sunrise.example.test/compute", {
        headers: { [SUNRISE_REQUEST_ID_HEADER]: "caller-controlled" },
      }),
    );
    const requestId = response.headers.get(SUNRISE_REQUEST_ID_HEADER);

    expect(validSunriseRequestId(requestId ?? undefined)).toBe(requestId);
    expect(requestId).not.toBe("caller-controlled");
    expect(
      response.headers.get(`x-middleware-request-${SUNRISE_REQUEST_ID_HEADER}`),
    ).toBe(requestId);
  });

  it("generates a distinct ID for each request", () => {
    const first = proxy(
      new NextRequest("https://sunrise.example.test/healthz"),
    );
    const second = proxy(
      new NextRequest("https://sunrise.example.test/healthz"),
    );

    expect(first.headers.get(SUNRISE_REQUEST_ID_HEADER)).not.toBe(
      second.headers.get(SUNRISE_REQUEST_ID_HEADER),
    );
  });
});
