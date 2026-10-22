import { describe, expect, it } from "vitest";
import {
  findIdentityProviderById,
  getIdentityProviderOptions,
  parseIdentityProviders,
} from "@/lib/auth-providers";

describe("identity provider presentation", () => {
  it("normalizes configured provider lists", () => {
    expect(parseIdentityProviders(" demo, workforce_sso, demo, ")).toEqual([
      "demo",
      "workforce_sso",
    ]);
    expect(parseIdentityProviders(undefined)).toEqual([]);
  });

  it("resolves provider-specific display names while preserving exact IDs", () => {
    const providers = getIdentityProviderOptions({
      KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo-provider,atmosphere",
      SUNRISE_IDENTITY_PROVIDER_DISPLAY_NAME_DEMO_PROVIDER: "VEXXHOST Demo",
    });

    expect(providers).toEqual([
      {
        id: "demo-provider",
        displayName: "VEXXHOST Demo",
      },
      {
        id: "atmosphere",
        displayName: "atmosphere",
      },
    ]);
    expect(
      findIdentityProviderById(providers, "demo-provider")?.displayName,
    ).toBe("VEXXHOST Demo");
  });
});
