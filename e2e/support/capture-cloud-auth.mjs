import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

function argument(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function keepCapturedCookie(name) {
  if (!name.startsWith("sunrise")) return true;
  return (
    name === "sunrise-identity-provider" || name === "sunrise-returning-visitor"
  );
}

const profile = argument("profile") ?? "cloud";
if (!/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(profile)) {
  throw new Error(
    "--profile must contain only letters, numbers, underscores, and hyphens",
  );
}

const baseURL = argument("url") ?? "http://localhost:9990";
const applicationUrl = new URL(baseURL);
const provider = argument("provider")?.trim();
const ignoreHTTPSErrors =
  process.env.SUNRISE_E2E_CLOUD_IGNORE_HTTPS_ERRORS === "1";
const authDirectory = resolve("playwright", ".auth");
const authFile = resolve(authDirectory, `${profile}.json`);

await mkdir(authDirectory, { recursive: true, mode: 0o700 });

const browser = await chromium.launch({ headless: false });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors });
  const page = await context.newPage();
  const destination = provider
    ? new URL(`/sign-in/${encodeURIComponent(provider)}`, applicationUrl)
    : applicationUrl;

  process.stdout.write(
    `Complete sign-in in the browser. Waiting for the Sunrise overview at ${applicationUrl.origin}...\n`,
  );
  try {
    await page.goto(destination.toString());
  } catch (error) {
    throw new Error(
      `Could not open the Sunrise sign-in flow from ${applicationUrl.origin}. Start the local development server or pass --url.`,
      { cause: error },
    );
  }
  await page
    .getByRole("heading", { name: "Overview", exact: true })
    .waitFor({ state: "visible", timeout: 10 * 60_000 });

  const state = await context.storageState();
  const rememberedProvider = state.cookies.find(
    (cookie) => cookie.name === "sunrise-identity-provider",
  );
  if (!rememberedProvider?.value) {
    throw new Error(
      "Sign-in completed without a remembered identity provider cookie",
    );
  }

  const sanitizedState = {
    cookies: state.cookies.filter((cookie) => keepCapturedCookie(cookie.name)),
    origins: state.origins.filter(
      ({ origin }) => origin !== applicationUrl.origin,
    ),
  };
  await writeFile(authFile, `${JSON.stringify(sanitizedState, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(authFile, 0o600);
  process.stdout.write(
    `Saved profile ${profile} to ${authFile}. Sunrise session and preference data were removed.\n`,
  );
} finally {
  await browser.close();
}
