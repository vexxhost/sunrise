import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const profile = process.env.SUNRISE_E2E_CLOUD_PROFILE ?? "cloud";
if (!/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(profile)) {
  throw new Error(
    "SUNRISE_E2E_CLOUD_PROFILE must contain only letters, numbers, underscores, and hyphens",
  );
}

const storageState = resolve("playwright", ".auth", `${profile}.json`);
if (!existsSync(storageState)) {
  throw new Error(
    `Authenticated browser state is missing at ${storageState}. Run pnpm test:e2e:cloud:capture -- --profile ${profile} first.`,
  );
}

const baseURL =
  process.env.SUNRISE_E2E_CLOUD_BASE_URL ?? "http://localhost:9990";
const applicationUrl = new URL(baseURL);
const localHost = ["127.0.0.1", "localhost"].includes(applicationUrl.hostname);
const startLocalServer =
  process.env.SUNRISE_E2E_CLOUD_START_SERVER === undefined
    ? localHost
    : process.env.SUNRISE_E2E_CLOUD_START_SERVER === "1";

if (startLocalServer && !localHost) {
  throw new Error(
    "SUNRISE_E2E_CLOUD_START_SERVER=1 is only supported for localhost URLs",
  );
}

const port =
  applicationUrl.port || (applicationUrl.protocol === "https:" ? "443" : "80");

export default defineConfig({
  testDir: "./e2e/cloud",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    storageState,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors:
      process.env.SUNRISE_E2E_CLOUD_IGNORE_HTTPS_ERRORS === "1",
  },
  projects: [
    {
      name: `cloud-${profile}`,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: startLocalServer
    ? {
        command: `pnpm dev --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
