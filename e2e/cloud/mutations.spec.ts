import { generateKeyPairSync, randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const enabledMutations = new Set(
  (process.env.SUNRISE_E2E_CLOUD_MUTATIONS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function disposablePublicKey() {
  const { publicKey } = generateKeyPairSync("ed25519");
  const { x } = publicKey.export({ format: "jwk" });
  if (!x) throw new Error("Could not export the disposable public key");

  const keyType = Buffer.from("ssh-ed25519");
  const keyData = Buffer.from(x, "base64url");
  const sshString = (value: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(value.length);
    return Buffer.concat([length, value]);
  };

  return `ssh-ed25519 ${Buffer.concat([
    sshString(keyType),
    sshString(keyData),
  ]).toString("base64")} sunrise-e2e`;
}

async function removeKeyPair(page: Page, name: string) {
  await page.goto("/compute/key-pairs");
  const link = page.getByRole("link", { name, exact: true });
  if ((await link.count()) === 0) return;

  const row = page.getByRole("row").filter({ has: link });
  await row.getByRole("checkbox", { name: "Select row" }).click();
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Delete key pairs?" });
  await dialog
    .getByRole("button", { name: "Delete key pairs", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(link).toHaveCount(0);
}

test.describe("disposable cloud mutations", () => {
  test.use({ cloudReturnTo: "/compute/key-pairs" });
  test.skip(
    !enabledMutations.has("key-pairs"),
    "Set SUNRISE_E2E_CLOUD_MUTATIONS=key-pairs to allow disposable key-pair CRUD",
  );

  test("imports and removes a disposable key pair", async ({ page }) => {
    const name = `sunrise-e2e-${Date.now()}-${randomUUID().slice(0, 8)}`;
    let creationSubmitted = false;

    try {
      await expect(
        page.getByRole("heading", { name: "Key Pairs", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Add key pair" }).click();

      const dialog = page.getByRole("dialog", { name: "Add key pair" });
      await dialog.getByRole("tab", { name: "Import public key" }).click();
      await dialog.getByLabel("Name").fill(name);
      await dialog
        .getByRole("textbox", { name: "Public key", exact: true })
        .fill(disposablePublicKey());
      creationSubmitted = true;
      await dialog
        .getByRole("button", { name: "Import key pair", exact: true })
        .click();

      await expect(dialog).toBeHidden();
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    } finally {
      if (creationSubmitted) await removeKeyPair(page, name);
    }
  });
});
