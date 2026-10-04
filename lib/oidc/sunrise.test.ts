import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAuthorizeUrl,
  buildEndSessionUrl,
  extractOidcIdentity,
  getSunriseOidcConfig,
  isRgwOidcConfigured,
  resolveOidcIdentity,
} from "@/lib/oidc/sunrise";

const issuer = "https://identity.example.test/realms/demo";
const clientId = "sunrise-server";
const workforceIssuer = "https://accounts.example.test/realms/workforce";
const workforceClientId = "sunrise-workforce";

function configureProviders() {
  Object.assign(process.env, {
    KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "demo,workforce",
    KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL: "openid",
    KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL_WORKFORCE:
      "workforce-openid",
    SUNRISE_KEYCLOAK_ISSUER_DEMO: issuer,
    SUNRISE_KEYCLOAK_CLIENT_ID_DEMO: clientId,
    SUNRISE_KEYCLOAK_CLIENT_SECRET_DEMO: "client-secret",
    SUNRISE_KEYCLOAK_RGW_CLIENT_ID_DEMO: "rgw-browser",
    SUNRISE_RGW_STS_SESSION_DURATION_DEMO: "1800",
    SUNRISE_KEYCLOAK_ISSUER_WORKFORCE: workforceIssuer,
    SUNRISE_KEYCLOAK_CLIENT_ID_WORKFORCE: workforceClientId,
    SUNRISE_KEYCLOAK_CLIENT_SECRET_WORKFORCE: "workforce-secret",
    SUNRISE_KEYCLOAK_RGW_CLIENT_ID_WORKFORCE: "rgw-workforce",
    SUNRISE_RGW_STS_SESSION_DURATION_WORKFORCE: "2700",
  });
}

function idToken(overrides: Record<string, unknown> = {}) {
  const claims = {
    iss: issuer,
    aud: clientId,
    sub: "user-123",
    exp: Math.floor(Date.now() / 1000) + 300,
    name: "Sunrise Operator",
    preferred_username: "operator@example.test",
    email: "operator@example.test",
    ...overrides,
  };
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");
}

describe("Sunrise OIDC", () => {
  beforeEach(() => {
    delete process.env.SUNRISE_KEYCLOAK_ISSUER;
    delete process.env.SUNRISE_KEYCLOAK_CLIENT_ID;
    delete process.env.SUNRISE_KEYCLOAK_CLIENT_SECRET;
    delete process.env.SUNRISE_KEYCLOAK_RGW_CLIENT_ID;
    delete process.env.SUNRISE_RGW_STS_SESSION_DURATION;
    configureProviders();
    process.env.DASHBOARD_URL = "https://sunrise.example.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/.well-known/openid-configuration")) {
          const discoveredIssuer = url.replace(
            "/.well-known/openid-configuration",
            "",
          );
          return Response.json({
            authorization_endpoint: `${discoveredIssuer}/protocol/openid-connect/auth`,
            token_endpoint: `${discoveredIssuer}/protocol/openid-connect/token`,
            end_session_endpoint: `${discoveredIssuer}/protocol/openid-connect/logout`,
            userinfo_endpoint: `${discoveredIssuer}/protocol/openid-connect/userinfo`,
          });
        }
        if (url.endsWith("/userinfo")) {
          return Response.json({
            sub: "user-123",
            name: "Verified Operator",
            preferred_username: "operator@example.test",
            email: "operator@example.test",
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
  });

  it("extracts a compact identity from an ID token intended for Sunrise", () => {
    expect(extractOidcIdentity(idToken(), "demo")).toEqual({
      subject: "user-123",
      displayName: "Sunrise Operator",
      preferredUsername: "operator@example.test",
      email: "operator@example.test",
      issuer,
      identityProvider: "demo",
    });
  });

  it("rejects expired, foreign-issuer, and wrong-audience ID tokens", () => {
    expect(
      extractOidcIdentity(
        idToken({ exp: Math.floor(Date.now() / 1000) - 1 }),
        "demo",
      ),
    ).toBeNull();
    expect(
      extractOidcIdentity(idToken({ iss: "https://attacker.example" }), "demo"),
    ).toBeNull();
    expect(
      extractOidcIdentity(idToken({ aud: "other-client" }), "demo"),
    ).toBeNull();
  });

  it("uses the provider UserInfo response for the displayed identity", async () => {
    await expect(
      resolveOidcIdentity("access-token", idToken(), "demo"),
    ).resolves.toMatchObject({
      subject: "user-123",
      displayName: "Verified Operator",
      email: "operator@example.test",
      identityProvider: "demo",
    });
  });

  it("builds account-selection authorization and provider logout URLs", async () => {
    const authorizeUrl = new URL(
      await buildAuthorizeUrl({
        identityProvider: "demo",
        challenge: "challenge",
        state: "state",
        prompt: "select_account",
      }),
    );
    expect(authorizeUrl.searchParams.get("prompt")).toBe("select_account");
    expect(authorizeUrl.searchParams.get("client_id")).toBe(clientId);

    const logoutUrl = new URL(
      (await buildEndSessionUrl({
        identityProvider: "demo",
        postLogoutRedirectUri: "https://sunrise.example.test/",
        idTokenHint: "id-token",
      })) ?? "",
    );
    expect(logoutUrl.pathname).toContain("openid-connect/logout");
    expect(logoutUrl.searchParams.get("client_id")).toBe(clientId);
    expect(logoutUrl.searchParams.get("id_token_hint")).toBe("id-token");
    expect(logoutUrl.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://sunrise.example.test/",
    );
  });

  it("keeps the primary OIDC client valid without S3 configuration", () => {
    delete process.env.SUNRISE_KEYCLOAK_RGW_CLIENT_ID_DEMO;

    expect(isRgwOidcConfigured("demo")).toBe(false);
    expect(getSunriseOidcConfig("demo")).toMatchObject({
      issuer,
      clientId,
      rgwAudience: undefined,
    });
  });

  it("keeps discovery, clients, protocols, and RGW settings provider scoped", async () => {
    const demo = getSunriseOidcConfig("demo");
    const workforce = getSunriseOidcConfig("workforce");
    const workforceAuthorizeUrl = new URL(
      await buildAuthorizeUrl({
        identityProvider: "workforce",
        challenge: "workforce-challenge",
        state: "workforce-state",
      }),
    );

    expect(demo).toMatchObject({
      protocol: "openid",
      issuer,
      clientId,
      rgwAudience: "rgw-browser",
      rgwStsDurationSeconds: 1800,
    });
    expect(workforce).toMatchObject({
      protocol: "workforce-openid",
      issuer: workforceIssuer,
      clientId: workforceClientId,
      rgwAudience: "rgw-workforce",
      rgwStsDurationSeconds: 2700,
    });
    expect(workforceAuthorizeUrl.origin + workforceAuthorizeUrl.pathname).toBe(
      `${workforceIssuer}/protocol/openid-connect/auth`,
    );
    expect(workforceAuthorizeUrl.searchParams.get("client_id")).toBe(
      workforceClientId,
    );
  });
});
