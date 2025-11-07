import { expect, test, DEFAULT_PROJECT, DEFAULT_REGION } from "./fixtures/mock-openstack";
import { seedSession, clearSession, shouldSeedSession } from "./support/session";

test.describe("Sunrise smoke flows", () => {
  test("WebSSO login form redirects to Keystone federation endpoint", async ({ page }) => {
    test.skip(!shouldSeedSession, "Login test only runs in mocked mode");

    await clearSession(page);

    await page.goto("/");
    await expect(page.getByPlaceholder("Identity Provider ID")).toBeVisible();

    const response = await page.request.post("/auth/websso", {
      form: { token: "mock-unscoped-token" },
    });

    expect(response.status()).toBe(303);
    expect(response.headers()["location"]).toBe("http://localhost:9990/");
  });

  test.describe("Compute views", () => {
    test.beforeEach(async ({ page }) => {
      await seedSession(page);
    });

    test("Instances table renders data and supports filters", async ({ page }) => {
      await page.goto("/compute/instances");
      await expect(page).toHaveURL(/\/compute\/instances$/);

      await expect(page.getByText(DEFAULT_REGION.id, { exact: true })).toBeVisible();
      await expect(page.getByText(DEFAULT_PROJECT.name, { exact: true })).toBeVisible();

      await expect(page.getByRole("cell", { name: "demo-instance" })).toBeVisible();
      await expect(page.getByRole("cell", { name: "general.small" })).toBeVisible();

      await page.getByRole("button", { name: "Filter" }).click();
      await page.locator("[cmdk-item]").filter({ hasText: /^Status$/ }).first().click();
      await page.locator("[cmdk-item]").filter({ hasText: /^Equals$/ }).first().click();
      await page.getByPlaceholder("Type value...").fill("ACTIVE");
      await page.keyboard.press("Enter");

      await expect(page.getByText('Status Equals "ACTIVE"')).toBeVisible();
      await expect(page.getByRole("cell", { name: "demo-instance" })).toBeVisible();
    });

    test("Sidebar navigation retains project context between views", async ({ page }) => {
      await page.goto("/compute/instances");

      const regionTrigger = page.getByText(DEFAULT_REGION.id, { exact: true });
      const projectTrigger = page.getByText(DEFAULT_PROJECT.name, { exact: true });

      await expect(regionTrigger).toBeVisible();
      await expect(projectTrigger).toBeVisible();

      await page.getByRole("link", { name: "Networks" }).click();
      await expect(page).toHaveURL(/\/compute\/networks$/);
      await expect(page.getByRole("cell", { name: "demo-network" })).toBeVisible();
      await expect(regionTrigger).toBeVisible();
      await expect(projectTrigger).toBeVisible();

      await page.getByRole("link", { name: "Volumes" }).click();
      await expect(page).toHaveURL(/\/compute\/volumes$/);
      await expect(page.getByRole("cell", { name: "demo-volume" })).toBeVisible();
      await expect(regionTrigger).toBeVisible();
      await expect(projectTrigger).toBeVisible();
    });
  });
});

