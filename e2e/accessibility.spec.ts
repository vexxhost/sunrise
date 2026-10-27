import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const wcagTags = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
  "best-practice",
];

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();

  expect(results.violations, "WCAG A/AA violations").toEqual([]);
}

async function rememberProvider(context: BrowserContext, baseURL?: string) {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  await context.addCookies([
    {
      name: "sunrise-returning-visitor",
      value: "1",
      url: baseURL,
    },
    {
      name: "sunrise-identity-provider",
      value: "e2e",
      url: baseURL,
    },
  ]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`the fresh sign-in screen has no ${colorScheme} theme WCAG A/AA violations`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Sign in to Sunrise" }),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
}

test("keyboard focus follows the sign-in workflow", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Identity provider")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Copy sign-in link" }),
  ).toBeFocused();
});

test("the remembered-provider screen is accessible on a narrow viewport", async ({
  baseURL,
  context,
  page,
}) => {
  await rememberProvider(context, baseURL);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page);

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: /E2E Identity Provider/ }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Copy sign-in link" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const alternativeProvider = page.getByRole("button", {
    name: "Use another provider",
  });
  await expect(alternativeProvider).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Identity provider")).toBeFocused();

  const documentWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(documentWidth.scroll).toBeLessThanOrEqual(documentWidth.client);

  const animationNames = await page
    .locator('[class*="sunrise-parallax-"]')
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).animationName),
    );
  expect(animationNames).not.toHaveLength(0);
  expect(animationNames.every((name) => name === "none")).toBe(true);
});

test("the idle-expiry notice is announced without accessibility violations", async ({
  baseURL,
  context,
  page,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  await context.addCookies([
    {
      name: "sunrise-returning-visitor",
      value: "1",
      url: baseURL,
    },
    {
      name: "sunrise-session-expiry",
      value: "idle",
      url: baseURL,
    },
  ]);

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Your previous session expired after a period without activity. Sign in to continue.",
    ),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test("validation feedback remains accessible", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Identity provider").fill("not-configured");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator("p[role=alert]")).toHaveText(
    "Invalid Identity Provider",
  );
  await expectNoAccessibilityViolations(page);
});
