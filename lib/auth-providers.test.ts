import { describe, expect, it } from "vitest";
import {
  findIdentityProviderById,
  findIdentityProviderBySignInSlug,
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

  it("resolves provider-specific display names and sign-in slugs", () => {
    const providers = getIdentityProviderOptions({
      KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo-provider,atmosphere",
      SUNRISE_IDENTITY_PROVIDER_DISPLAY_NAME_DEMO_PROVIDER: "VEXXHOST Demo",
      SUNRISE_IDENTITY_PROVIDER_SIGN_IN_SLUG_DEMO_PROVIDER: "demo",
    });

    expect(providers).toEqual([
      {
        id: "demo-provider",
        displayName: "VEXXHOST Demo",
        signInSlug: "demo",
      },
      {
        id: "atmosphere",
        displayName: "atmosphere",
        signInSlug: "atmosphere",
      },
    ]);
    expect(findIdentityProviderBySignInSlug(providers, "demo")?.id).toBe(
      "demo-provider",
    );
    expect(
      findIdentityProviderById(providers, "demo-provider")?.displayName,
    ).toBe("VEXXHOST Demo");
  });

  it.each(["VEXXHOST Demo", "demo_provider", "-demo", "demo-"])(
    "rejects invalid sign-in slug %s",
    (signInSlug) => {
      expect(() =>
        getIdentityProviderOptions({
          KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo",
          SUNRISE_IDENTITY_PROVIDER_SIGN_IN_SLUG_DEMO: signInSlug,
        }),
      ).toThrow(/SUNRISE_IDENTITY_PROVIDER_SIGN_IN_SLUG_DEMO/);
    },
  );

  it("rejects duplicate sign-in slugs", () => {
    expect(() =>
      getIdentityProviderOptions({
        KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo,workforce",
        SUNRISE_IDENTITY_PROVIDER_SIGN_IN_SLUG_DEMO: "cloud",
        SUNRISE_IDENTITY_PROVIDER_SIGN_IN_SLUG_WORKFORCE: "cloud",
      }),
    ).toThrow(/same sign-in slug/);
  });
});
