import { expect, test as base } from "../fixtures";

type CloudOptions = {
  cloudReturnTo: string;
};

type CloudFixtures = {
  authenticatedCloud: void;
};

export const test = base.extend<CloudOptions & CloudFixtures>({
  cloudReturnTo: ["/", { option: true }],
  authenticatedCloud: [
    async ({ baseURL, cloudReturnTo, context, page }, use) => {
      if (!baseURL) throw new Error("Playwright baseURL is required");
      if (!cloudReturnTo.startsWith("/") || cloudReturnTo.startsWith("//")) {
        throw new Error("cloudReturnTo must be a local absolute path");
      }

      const storedCookies = await context.cookies();
      const provider =
        process.env.SUNRISE_E2E_CLOUD_PROVIDER?.trim() ||
        storedCookies.find(
          (cookie) => cookie.name === "sunrise-identity-provider",
        )?.value;
      if (!provider) {
        throw new Error(
          "The captured browser state does not identify a Sunrise identity provider. Capture it again or set SUNRISE_E2E_CLOUD_PROVIDER.",
        );
      }

      await context.clearCookies({
        name: /^sunrise(?:-activity)?(?:\.|$)/,
      });
      const loginUrl = new URL(
        `/sign-in/${encodeURIComponent(provider)}`,
        baseURL,
      );
      if (cloudReturnTo !== "/") {
        loginUrl.searchParams.set("returnTo", cloudReturnTo);
      }

      await page.goto(loginUrl.toString());
      try {
        await page
          .locator("main")
          .first()
          .waitFor({ state: "visible", timeout: 60_000 });
      } catch (error) {
        throw new Error(
          `Could not create a fresh Sunrise session from the captured IdP state. Capture the profile again. Current URL: ${page.url()}`,
          { cause: error },
        );
      }

      expect(new URL(page.url()).origin).toBe(new URL(baseURL).origin);
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "../fixtures";
