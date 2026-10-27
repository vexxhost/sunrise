import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

function contextTrigger(page: Page, label: "Project" | "Region") {
  return page.getByRole("button", { name: new RegExp(`^${label}: `) });
}

function selectedContextName(trigger: Locator, label: "Project" | "Region") {
  return trigger.getAttribute("aria-label").then((value) => {
    if (!value) throw new Error(`${label} selector has no accessible name`);
    return value.slice(`${label}: `.length);
  });
}

async function openContextMenu(trigger: Locator, label: "Project" | "Region") {
  await trigger.click();
  const content = trigger
    .locator("xpath=..")
    .locator('[data-slot="navigation-menu-content"]');
  await expect(content, `${label} options`).toBeVisible();
  return content;
}

test("a captured IdP session creates a fresh authenticated Sunrise session", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(contextTrigger(page, "Project")).toBeVisible();
  await expect(contextTrigger(page, "Region")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in to Sunrise" }),
  ).toHaveCount(0);
});

test.describe("authenticated deep links", () => {
  test.use({ cloudReturnTo: "/compute/instances" });

  test("returns to a live instance collection after SSO", async ({ page }) => {
    await expect(page).toHaveURL(/\/compute\/instances(?:\?.*)?$/);
    await expect(
      page.getByRole("heading", { name: "Instances", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });
});

for (const label of ["Project", "Region"] as const) {
  test(`switches the active ${label.toLowerCase()} in an isolated session`, async ({
    page,
  }) => {
    const trigger = contextTrigger(page, label);
    const original = await selectedContextName(trigger, label);
    const menu = await openContextMenu(trigger, label);
    const optionNames = (await menu.getByRole("button").allTextContents())
      .map((value) => value.trim())
      .filter(Boolean);
    const alternate = optionNames.find((value) => value !== original);
    test.skip(
      !alternate,
      `The authenticated account has only one ${label.toLowerCase()}`,
    );

    await menu.getByRole("button", { name: alternate!, exact: true }).click();
    await expect(trigger).toHaveAttribute(
      "aria-label",
      `${label}: ${alternate}`,
    );
    if (label === "Project") {
      await expect(
        page.locator("header").getByText(alternate!, { exact: true }),
      ).toBeVisible();
    }
  });
}

test("recovers a stale instance deep link without a browser error", async ({
  page,
}) => {
  await page.goto(`/compute/instances/${randomUUID()}`);

  await expect(page).toHaveURL(
    /\/compute\/instances\?[^#]*notice=resource-unavailable/,
  );
  await expect(page.getByRole("status")).toContainText("Instance unavailable");
});

test("opens the Object Storage collection when the active cloud exposes it", async ({
  page,
}) => {
  await page.goto("/object-storage");
  const buckets = page.getByRole("link", { name: /Buckets/ }).first();
  test.skip(
    (await buckets.count()) === 0,
    "Object Storage buckets are unavailable for this provider and region",
  );

  await buckets.click();
  await expect(
    page.getByRole("heading", { name: "Buckets", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
});
