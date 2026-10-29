import { describe, expect, it } from "vitest";
import {
  createSunriseRequestId,
  sunriseRequestIdFromHeaders,
  SUNRISE_REQUEST_ID_HEADER,
  validSunriseRequestId,
} from "@/lib/request-correlation";

describe("request correlation", () => {
  it("creates UUID request identifiers", () => {
    const requestId = createSunriseRequestId();
    expect(validSunriseRequestId(requestId)).toBe(requestId);
  });

  it("reads identifiers from Headers and Next instrumentation records", () => {
    const requestId = "123e4567-e89b-42d3-a456-426614174000";
    expect(
      sunriseRequestIdFromHeaders(
        new Headers({ [SUNRISE_REQUEST_ID_HEADER]: requestId }),
      ),
    ).toBe(requestId);
    expect(
      sunriseRequestIdFromHeaders({ "X-Sunrise-Request-Id": requestId }),
    ).toBe(requestId);
  });

  it("rejects untrusted identifier formats", () => {
    expect(validSunriseRequestId("user-controlled-value")).toBeUndefined();
    expect(
      sunriseRequestIdFromHeaders({
        [SUNRISE_REQUEST_ID_HEADER]: "user-controlled-value",
      }),
    ).toBeUndefined();
  });
});
