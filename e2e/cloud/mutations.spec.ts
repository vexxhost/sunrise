import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function createBucket(page: Page, name: string) {
  await page.goto("/object-storage/buckets");
  await page.getByRole("button", { name: "Create bucket" }).click();
  const dialog = page.getByRole("dialog", { name: "Create bucket" });
  await dialog.getByLabel("Bucket name").fill(name);
  await dialog
    .getByRole("button", { name: "Create bucket", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
}

async function removeObject(
  page: Page,
  bucket: string,
  key: string,
  directMode: boolean,
) {
  const path = `/object-storage/buckets/${encodeURIComponent(bucket)}${
    directMode ? "/direct" : ""
  }`;
  if (new URL(page.url()).pathname !== path) await page.goto(path);
  await page.waitForLoadState("networkidle");
  const link = page.getByRole("link", { name: key, exact: true });
  if ((await link.count()) === 0) return;

  const row = page.getByRole("row").filter({ has: link });
  await row.getByRole("checkbox", { name: "Select row" }).click();
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Remove selected" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove item?" });
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(link).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

async function removeBucket(page: Page, name: string) {
  await page.goto("/object-storage/buckets");
  await page.waitForLoadState("networkidle");
  const link = page.getByRole("link", { name, exact: true });
  if ((await link.count()) === 0) return;

  await page.getByTitle(`Delete ${name}`).click();
  const dialog = page.getByRole("dialog", { name: "Delete bucket?" });
  await dialog
    .getByRole("button", { name: "Delete bucket", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(link).toHaveCount(0);
}

async function sparseUploadFile(name: string, size: number) {
  const directory = await mkdtemp(join(tmpdir(), "sunrise-s3-e2e-"));
  const path = join(directory, name);
  const file = await open(path, "w");
  try {
    await file.truncate(size);
  } finally {
    await file.close();
  }
  return { directory, path };
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

test.describe("disposable S3 multipart mutations", () => {
  test.use({ cloudReturnTo: "/object-storage/buckets" });
  test.skip(
    !enabledMutations.has("s3-multipart"),
    "Set SUNRISE_E2E_CLOUD_MUTATIONS=s3-multipart to allow disposable S3 multipart CRUD",
  );

  test("uploads and removes a multipart object", async ({ page }) => {
    test.setTimeout(5 * 60_000);
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const bucket = `sunrise-e2e-multipart-${suffix}`;
    const object = `multipart-${suffix}.bin`;
    let bucketCreated = false;
    let directMode = false;
    let temporaryDirectory: string | null = null;
    let testError: unknown;

    try {
      await createBucket(page, bucket);
      bucketCreated = true;
      await page.getByRole("link", { name: bucket, exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(`/object-storage/buckets/${bucket}(?:/direct)?(?:\\?|$)`),
      );
      await expect(page.locator('input[type="file"]').first()).toBeAttached();

      directMode = new URL(page.url()).pathname.endsWith("/direct");
      const size = (directMode ? 101 : 9) * 1024 * 1024;
      const upload = await sparseUploadFile(object, size);
      temporaryDirectory = upload.directory;

      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles(upload.path);
      await page.getByRole("button", { name: "Upload", exact: true }).click();
      await expect(
        page.getByText(
          directMode
            ? "Uploaded 1 object directly to RGW."
            : "Uploaded 1 object.",
          { exact: true },
        ),
      ).toBeVisible({ timeout: 4 * 60_000 });
      await expect(
        page.getByRole("link", { name: object, exact: true }),
      ).toBeVisible();
    } catch (error) {
      testError = error;
    } finally {
      const cleanupErrors: unknown[] = [];
      if (bucketCreated) {
        await removeObject(page, bucket, object, directMode).catch((error) =>
          cleanupErrors.push(error),
        );
        await removeBucket(page, bucket).catch((error) =>
          cleanupErrors.push(error),
        );
      }
      if (temporaryDirectory) {
        await rm(temporaryDirectory, { recursive: true, force: true }).catch(
          (error) => cleanupErrors.push(error),
        );
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          testError ? [testError, ...cleanupErrors] : cleanupErrors,
          testError
            ? "The multipart test failed and its disposable resources could not be fully cleaned up"
            : "Could not clean up the disposable multipart test resources",
        );
      }
    }
    if (testError) throw testError;
  });
});
