import {
  expect,
  test as base,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";

type BrowserDiagnostics = {
  browserDiagnostics: void;
};

type BrowserDiagnostic = {
  kind: "console" | "page";
  text: string;
  url?: string;
};

function consoleError(message: ConsoleMessage): BrowserDiagnostic {
  return {
    kind: "console",
    text: `console.error: ${message.text()}`,
    url: message.location().url,
  };
}

function pageError(error: Error): BrowserDiagnostic {
  return {
    kind: "page",
    text: `pageerror: ${error.stack ?? error.message}`,
  };
}

function collectDiagnostics(
  page: Page,
  diagnostics: BrowserDiagnostic[],
  expectedHeadNotFoundUrls: Set<string>,
) {
  page.on("response", (response) => {
    if (response.status() === 404 && response.request().method() === "HEAD") {
      expectedHeadNotFoundUrls.add(response.url());
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(consoleError(message));
  });
  page.on("pageerror", (error) => diagnostics.push(pageError(error)));
}

function isExpectedHeadNotFound(
  diagnostic: BrowserDiagnostic,
  expectedHeadNotFoundUrls: Set<string>,
) {
  return (
    diagnostic.kind === "console" &&
    /^console\.error: Failed to load resource: the server responded with a status of 404(?: \([^)]*\))?$/.test(
      diagnostic.text,
    ) &&
    !!diagnostic.url &&
    expectedHeadNotFoundUrls.has(diagnostic.url)
  );
}

export const test = base.extend<BrowserDiagnostics>({
  browserDiagnostics: [
    async ({ page }, use) => {
      const diagnostics: BrowserDiagnostic[] = [];
      const expectedHeadNotFoundUrls = new Set<string>();
      collectDiagnostics(page, diagnostics, expectedHeadNotFoundUrls);
      await use();
      expect(
        diagnostics
          .filter(
            (diagnostic) =>
              !isExpectedHeadNotFound(diagnostic, expectedHeadNotFoundUrls),
          )
          .map((diagnostic) => diagnostic.text),
        "browser diagnostics",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
