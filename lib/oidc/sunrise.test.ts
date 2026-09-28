import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAuthorizeUrl,
  buildEndSessionUrl,
  extractOidcIdentity,
  resolveOidcIdentity,
} from "@/lib/oidc/sunrise";

const issuer = "https://identity.example.test/realms/demo";
const clientId = "sunrise-server";

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
    process.env.KEYCLOAK_ISSUER = issuer;
    process.env.KEYCLOAK_SERVER_CLIENT_ID = clientId;
    process.env.KEYCLOAK_SERVER_CLIENT_SECRET = "client-secret";
    process.env.KEYCLOAK_S3_CLIENT_ID = "rgw-browser";
    process.env.DASHBOARD_URL = "https://sunrise.example.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/.well-known/openid-configuration")) {
          return Response.json({
            authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
            token_endpoint: `${issuer}/protocol/openid-connect/token`,
            end_session_endpoint: `${issuer}/protocol/openid-connect/logout`,
            userinfo_endpoint: `${issuer}/protocol/openid-connect/userinfo`,
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
        challenge: "challenge",
        state: "state",
        prompt: "select_account",
      }),
    );
    expect(authorizeUrl.searchParams.get("prompt")).toBe("select_account");
    expect(authorizeUrl.searchParams.get("client_id")).toBe(clientId);

    const logoutUrl = new URL(
      (await buildEndSessionUrl({
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
});
