import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const appPort = 9990;
const identityProviderPort = 18888;
const baseURL = `http://${host}:${appPort}`;
const identityProviderIssuer = `http://${host}:${identityProviderPort}/realms/e2e`;
const appCommand = process.env.CI
  ? "pnpm build && node e2e/support/start-standalone.mjs"
  : `pnpm dev --hostname ${host} --port ${appPort}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["cloud/**", "kind/**"],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/support/fake-identity-provider.mjs",
      url: `${identityProviderIssuer}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        SUNRISE_E2E_IDENTITY_PROVIDER_HOST: host,
        SUNRISE_E2E_IDENTITY_PROVIDER_PORT: String(identityProviderPort),
      },
    },
    {
      command: appCommand,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        HOSTNAME: host,
        PORT: String(appPort),
        SUNRISE_DASHBOARD_URL: baseURL,
        NODE_TLS_REJECT_UNAUTHORIZED: "1",
        SUNRISE_SESSION_SECRET: "playwright-session-secret-is-local-only",
        SUNRISE_SESSION_BACKEND: "cookie",
        SUNRISE_SESSION_IDLE_TIMEOUT_SECONDS: "1800",
        SUNRISE_SESSION_ABSOLUTE_TIMEOUT_SECONDS: "28800",
        SUNRISE_OBJECT_STORAGE_BACKENDS: "swift",
        KEYSTONE_API: "http://127.0.0.1:15000",
        KEYSTONE_PUBLIC_API: "http://127.0.0.1:15000",
        KEYSTONE_FEDERATION_IDENTITY_PROVIDERS: "e2e",
        KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL: "openid",
        SUNRISE_IDENTITY_PROVIDER_DISPLAY_NAME_E2E: "E2E Identity Provider",
        SUNRISE_KEYCLOAK_ISSUER_E2E: identityProviderIssuer,
        SUNRISE_KEYCLOAK_CLIENT_ID_E2E: "sunrise-e2e",
        SUNRISE_KEYCLOAK_CLIENT_SECRET_E2E:
          "playwright-client-secret-is-local-only",
      },
    },
  ],
});
