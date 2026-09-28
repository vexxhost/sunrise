import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  identityApiUrl,
  publicIdentityApiUrl,
} from "@/lib/openstack/identity-api";

const originalServerUrl = process.env.KEYSTONE_API;
const originalPublicUrl = process.env.NEXT_PUBLIC_KEYSTONE_API;

afterEach(() => {
  if (originalServerUrl === undefined) delete process.env.KEYSTONE_API;
  else process.env.KEYSTONE_API = originalServerUrl;

  if (originalPublicUrl === undefined) {
    delete process.env.NEXT_PUBLIC_KEYSTONE_API;
  } else {
    process.env.NEXT_PUBLIC_KEYSTONE_API = originalPublicUrl;
  }
});

describe("identity API URLs", () => {
  it("keeps server and browser endpoints distinct", () => {
    process.env.KEYSTONE_API = "http://keystone-api.internal:5000/";
    process.env.NEXT_PUBLIC_KEYSTONE_API = "https://identity.example.test";

    expect(identityApiUrl()).toBe("http://keystone-api.internal:5000/v3");
    expect(publicIdentityApiUrl()).toBe("https://identity.example.test/v3");
  });

  it("does not duplicate an existing v3 path", () => {
    process.env.KEYSTONE_API = "http://keystone-api.internal:5000/v3";
    process.env.NEXT_PUBLIC_KEYSTONE_API =
      "https://identity.example.test/v3/";

    expect(identityApiUrl()).toBe("http://keystone-api.internal:5000/v3");
    expect(publicIdentityApiUrl()).toBe("https://identity.example.test/v3");
  });
});
