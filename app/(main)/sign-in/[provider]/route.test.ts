import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS =
    "demo-provider,atmosphere";
  process.env.SUNRISE_IDENTITY_PROVIDER_SIGN_IN_SLUG_DEMO_PROVIDER = "demo";
});

import { GET } from "./route";

describe("identity-provider sign-in link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards a validated provider and local deep link", async () => {
    const response = await GET(
      new Request(
        "https://sunrise.example.test/sign-in/demo?returnTo=%2Fconsole%2Fproject-1%2Fserver-1%3Fprotocol%3Dvnc%26region%3DRegionOne",
      ),
      { params: Promise.resolve({ provider: "demo" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/auth/oidc/login?idp=demo-provider&returnTo=%2Fconsole%2Fproject-1%2Fserver-1%3Fprotocol%3Dvnc%26region%3DRegionOne",
    );
  });

  it("does not forward an external return destination", async () => {
    const response = await GET(
      new Request(
        "https://sunrise.example.test/sign-in/demo?returnTo=https%3A%2F%2Fattacker.example",
      ),
      { params: Promise.resolve({ provider: "demo" }) },
    );

    expect(response.headers.get("location")).toBe(
      "https://sunrise.example.test/auth/oidc/login?idp=demo-provider",
    );
  });

  it("rejects providers that are not configured", async () => {
    const response = await GET(
      new Request("https://sunrise.example.test/sign-in/unknown"),
      { params: Promise.resolve({ provider: "unknown" }) },
    );

    expect(response.status).toBe(404);
  });
});
