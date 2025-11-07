import type { Page } from "@playwright/test";
import { DEFAULT_PROJECT, DEFAULT_REGION } from "../fixtures/mock-openstack";

export const shouldSeedSession =
  !process.env.LIVE_BACKEND ||
  process.env.LIVE_BACKEND === "0" ||
  process.env.LIVE_BACKEND.toLowerCase() === "false";

export async function seedSession(page: Page) {
  if (!shouldSeedSession) {
    return;
  }

  await page.request.post("/api/test/session", {
    data: {
      keystoneUnscopedToken: "mock-unscoped-token",
      keystoneProjectToken: "mock-project-token",
      regionId: DEFAULT_REGION.id,
      projectId: DEFAULT_PROJECT.id,
    },
  });
}

export async function clearSession(page: Page) {
  if (!shouldSeedSession) {
    return;
  }

  await page.request.post("/api/test/session", {
    data: { clear: true },
  });
}

