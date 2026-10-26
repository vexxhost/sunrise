import { expect, test } from "./fixtures";

test("a new visitor sees a first-time sign-in screen", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Sign in to Sunrise" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Identity provider")).toBeVisible();
});

test("copying a sign-in link uses the current input without requiring blur", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Identity provider").fill("e2e");
  await page.getByRole("button", { name: "Copy sign-in link" }).click();

  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const copiedUrl = new URL(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(copiedUrl.pathname).toBe("/sign-in/e2e");
  expect(copiedUrl.search).toBe("");
});

test("a protected deep link is preserved in a copied sign-in link", async ({
  page,
}) => {
  await page.goto("/kubernetes/clusters?view=active#node-groups");

  await page.getByLabel("Identity provider").fill("e2e");
  await page.getByRole("button", { name: "Copy sign-in link" }).click();

  const copiedUrl = new URL(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(copiedUrl.pathname).toBe("/sign-in/e2e");
  expect(copiedUrl.searchParams.get("returnTo")).toBe(
    "/kubernetes/clusters?view=active#node-groups",
  );
});

test("a remembered provider is primary and the alternative form is collapsed", async ({
  context,
  page,
  baseURL,
}) => {
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

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByText("Previous identity provider")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /E2E Identity Provider/ }),
  ).toBeVisible();
  await expect(page.getByLabel("Identity provider")).toHaveCount(0);

  const alternativeProvider = page.getByRole("button", {
    name: "Use another provider",
  });
  await expect(alternativeProvider).toHaveAttribute("aria-expanded", "false");
  await alternativeProvider.click();
  await expect(page.getByLabel("Identity provider")).toBeFocused();
});

test("an invalid provider is rejected without leaving Sunrise", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Identity provider").fill("not-configured");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator("p[role=alert]")).toHaveText(
    "Invalid Identity Provider",
  );
  await expect(page).toHaveURL("/");
});

test("a provider bookmark creates a PKCE authorization request and keeps returnTo", async ({
  page,
}) => {
  await page.goto("/sign-in/e2e?returnTo=%2Fkubernetes%2Fclusters");

  await expect(
    page.getByRole("heading", { name: "Test identity provider" }),
  ).toBeVisible();
  const authorizationUrl = new URL(page.url());
  expect(authorizationUrl.pathname).toBe(
    "/realms/e2e/protocol/openid-connect/auth",
  );
  expect(authorizationUrl.searchParams.get("client_id")).toBe("sunrise-e2e");
  expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
    "http://127.0.0.1:9990/auth/oidc/callback",
  );
  expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
  expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe(
    "S256",
  );
  expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy();
  expect(authorizationUrl.searchParams.get("state")).toBeTruthy();

  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === "sunrise");
  expect(sessionCookie?.value).toBeTruthy();
});
