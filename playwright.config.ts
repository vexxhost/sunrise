import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const envFile = process.env.PLAYWRIGHT_ENV_PATH ?? ".env.e2e";
const resolvedEnvPath = path.isAbsolute(envFile)
  ? envFile
  : path.join(process.cwd(), envFile);

if (fs.existsSync(resolvedEnvPath)) {
  dotenv.config({ path: resolvedEnvPath, override: false });
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:9990";
const mockPort = Number(process.env.MOCK_OPENSTACK_PORT ?? "6101");
const mockBase =
  process.env.MOCK_OPENSTACK_BASE_URL ?? `http://127.0.0.1:${mockPort}`;
const isLiveBackend =
  !!process.env.LIVE_BACKEND &&
  process.env.LIVE_BACKEND !== "0" &&
  process.env.LIVE_BACKEND.toLowerCase() !== "false";

export default defineConfig({
  testDir: "./tests/playwright",
  fullyParallel: true,
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: {
      "Accept": "application/json",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  outputDir: "test-results",
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev -- --port 9990",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        env: (() => {
          const env: Record<string, string> = {
            PORT: process.env.PORT ?? "9990",
            SESSION_SECRET:
              process.env.SESSION_SECRET ?? "playwright-test-session-secret",
            DASHBOARD_URL: process.env.DASHBOARD_URL ?? baseURL,
            KEYSTONE_FEDERATION_IDENTITY_PROVIDERS:
              process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS ?? "mock-idp",
            KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL:
              process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL ??
              "saml2",
            MOCK_OPENSTACK_PORT: String(mockPort),
            LIVE_BACKEND: process.env.LIVE_BACKEND ?? "",
            ENABLE_TEST_ROUTES:
              process.env.ENABLE_TEST_ROUTES ?? (isLiveBackend ? "0" : "1"),
            NEXT_DISABLE_TURBOPACK: process.env.NEXT_DISABLE_TURBOPACK ?? "1",
            TURBOPACK: process.env.TURBOPACK ?? "0",
            NODE_ENV: process.env.NODE_ENV ?? "development",
          };

          if (isLiveBackend) {
            if (process.env.KEYSTONE_API) {
              env.KEYSTONE_API = process.env.KEYSTONE_API;
            }
          } else {
            env.KEYSTONE_API = `${mockBase}/keystone`;
          }

          return env;
        })(),
      },
});

