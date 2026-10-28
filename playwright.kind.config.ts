import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const profile = process.env.SUNRISE_E2E_CLOUD_PROFILE ?? "kind";
if (!/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(profile)) {
  throw new Error(
    "SUNRISE_E2E_CLOUD_PROFILE must contain only letters, numbers, underscores, and hyphens",
  );
}

const storageState = resolve("playwright", ".auth", profile + ".json");
if (!existsSync(storageState)) {
  throw new Error(
    "Authenticated browser state is missing at " +
      storageState +
      ". Capture it with the deployed kind origin first.",
  );
}

const baseURL =
  process.env.SUNRISE_E2E_CLOUD_BASE_URL ?? "https://sunrise.localtest.me";

export default defineConfig({
  testDir: "./e2e/kind",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 6 * 60_000,
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
      name: "kind-" + profile,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
