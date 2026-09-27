import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "./route";

describe("resource recovery route", () => {
  it("redirects preference-backed resources without mutating cookies", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=instance&id=removed-server",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/compute/instances?notice=resource-unavailable&kind=instance&resourceId=removed-server",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("derives the redirect internally for direct object recovery", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=object&id=folder%2Fmissing.txt&parentId=demo-bucket&mode=direct",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/object-storage/buckets/demo-bucket/direct?notice=resource-unavailable&kind=object",
    );
  });

  it("rejects unknown resource kinds", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/preferences/resources/recover?kind=https%3A%2F%2Fevil.example&id=removed",
      ),
    );

    expect(response.status).toBe(400);
  });
});
