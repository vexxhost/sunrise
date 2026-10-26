import {
  expect,
  test as base,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";

type BrowserDiagnostics = {
  browserDiagnostics: void;
};

function consoleError(message: ConsoleMessage) {
  return `console.error: ${message.text()}`;
}

function pageError(error: Error) {
  return `pageerror: ${error.stack ?? error.message}`;
}

function collectDiagnostics(page: Page, diagnostics: string[]) {
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(consoleError(message));
  });
  page.on("pageerror", (error) => diagnostics.push(pageError(error)));
}

export const test = base.extend<BrowserDiagnostics>({
  browserDiagnostics: [
    async ({ page }, use) => {
      const diagnostics: string[] = [];
      collectDiagnostics(page, diagnostics);
      await use();
      expect(diagnostics, "browser diagnostics").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
