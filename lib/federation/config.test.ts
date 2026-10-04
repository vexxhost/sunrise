import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  federationProviderEnvironmentSuffix,
  getFederationProviderConfig,
  getFederationProviderConfigs,
} from "@/lib/federation/config";

describe("federation provider configuration", () => {
  it("resolves independent OIDC, Keystone, and RGW duration settings", () => {
    const environment = {
      KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo,workforce-sso",
      KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL: "openid",
      KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL_WORKFORCE_SSO:
        "workforce-openid",
      SUNRISE_KEYCLOAK_ISSUER_DEMO:
        "https://identity.example.test/realms/demo/",
      SUNRISE_KEYCLOAK_CLIENT_ID_DEMO: "sunrise-demo",
      SUNRISE_KEYCLOAK_CLIENT_SECRET_DEMO: "demo-secret",
      SUNRISE_RGW_STS_SESSION_DURATION_SECONDS_DEMO: "7200",
      SUNRISE_KEYCLOAK_ISSUER_WORKFORCE_SSO:
        "https://identity.example.test/realms/workforce",
      SUNRISE_KEYCLOAK_CLIENT_ID_WORKFORCE_SSO: "sunrise-workforce",
      SUNRISE_KEYCLOAK_CLIENT_SECRET_WORKFORCE_SSO: "workforce-secret",
    };

    expect(getFederationProviderConfig("demo", environment)).toEqual({
      id: "demo",
      protocol: "openid",
      issuer: "https://identity.example.test/realms/demo",
      clientId: "sunrise-demo",
      clientSecret: "demo-secret",
      rgwStsDurationSeconds: 7200,
    });
    expect(getFederationProviderConfig("workforce-sso", environment)).toEqual({
      id: "workforce-sso",
      protocol: "workforce-openid",
      issuer: "https://identity.example.test/realms/workforce",
      clientId: "sunrise-workforce",
      clientSecret: "workforce-secret",
      rgwStsDurationSeconds: 3600,
    });
  });

  it("uses global fallbacks and the built-in protocol and duration defaults", () => {
    const environment = {
      KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo",
      SUNRISE_KEYCLOAK_ISSUER: "https://identity.example.test/realms/default",
      SUNRISE_KEYCLOAK_CLIENT_ID: "sunrise-default",
      SUNRISE_KEYCLOAK_CLIENT_SECRET: "default-secret",
    };

    expect(getFederationProviderConfig("demo", environment)).toEqual({
      id: "demo",
      protocol: "openid",
      issuer: "https://identity.example.test/realms/default",
      clientId: "sunrise-default",
      clientSecret: "default-secret",
      rgwStsDurationSeconds: 3600,
    });
  });

  it("normalizes portable suffixes and rejects collisions", () => {
    expect(federationProviderEnvironmentSuffix("Provider-nAme")).toBe(
      "PROVIDER_NAME",
    );
    expect(federationProviderEnvironmentSuffix("provider.name")).toBe(
      "PROVIDER_NAME",
    );

    expect(() =>
      getFederationProviderConfigs({
        KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "provider-name,provider_name",
      }),
    ).toThrow(/both map.*PROVIDER_NAME/);
  });

  it("requires the new Sunrise variables and drops legacy Keycloak fallbacks", () => {
    expect(() =>
      getFederationProviderConfig("demo", {
        KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo",
        KEYCLOAK_ISSUER: "https://identity.example.test/realms/demo",
        KEYCLOAK_SERVER_CLIENT_ID: "sunrise-server",
        KEYCLOAK_SERVER_CLIENT_SECRET: "legacy-secret",
      }),
    ).toThrow(/SUNRISE_KEYCLOAK_ISSUER_DEMO/);
  });

  it("does not expose secret values in validation errors", () => {
    const environment = {
      KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo",
      SUNRISE_KEYCLOAK_ISSUER_DEMO: "not-a-url",
      SUNRISE_KEYCLOAK_CLIENT_ID_DEMO: "sunrise-demo",
      SUNRISE_KEYCLOAK_CLIENT_SECRET_DEMO: "do-not-leak-this",
    };

    expect(() => getFederationProviderConfigs(environment)).toThrow(
      /must be a valid URL/,
    );
    try {
      getFederationProviderConfigs(environment);
    } catch (error) {
      expect(String(error)).not.toContain("do-not-leak-this");
    }
  });

  it.each(["600", "43201", "1.5", "not-a-number"])(
    "rejects invalid STS duration %s",
    (duration) => {
      expect(() =>
        getFederationProviderConfigs({
          KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo",
          SUNRISE_KEYCLOAK_ISSUER_DEMO:
            "https://identity.example.test/realms/demo",
          SUNRISE_KEYCLOAK_CLIENT_ID_DEMO: "sunrise-demo",
          SUNRISE_KEYCLOAK_CLIENT_SECRET_DEMO: "demo-secret",
          SUNRISE_RGW_STS_SESSION_DURATION_SECONDS_DEMO: duration,
        }),
      ).toThrow(/SUNRISE_RGW_STS_SESSION_DURATION_SECONDS_DEMO/);
    },
  );
});
