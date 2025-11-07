import { expect, test, DEFAULT_CLUSTER, DEFAULT_CLUSTER_TEMPLATE } from "./fixtures/mock-openstack";
import { seedSession } from "./support/session";

test.describe("Magnum UI flows", () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page);
  });

  test("Cluster templates table renders and validates labels JSON", async ({ page }) => {
    await page.goto("/kubernetes/templates");

    await expect(page.getByRole("heading", { name: "Cluster Templates" })).toBeVisible();
    await expect(page.getByRole("cell", { name: DEFAULT_CLUSTER_TEMPLATE.name })).toBeVisible();
    await expect(page.getByRole("cell", { name: /kubernetes/i })).toBeVisible();

    await page.getByRole("button", { name: "Create Template" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Labels (JSON object)").fill("not-json");
    await dialog.getByRole("button", { name: "Create Template" }).click();
    await expect(dialog.getByText("Labels must be a valid JSON object with string values.")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Clusters list shows metrics and navigates to detail view", async ({ page }) => {
    await page.goto("/kubernetes/clusters");

    await expect(page.getByRole("heading", { name: "Clusters" })).toBeVisible();
    await expect(page.getByRole("cell", { name: DEFAULT_CLUSTER.name })).toBeVisible();
    await expect(page.getByRole("cell", { name: DEFAULT_CLUSTER.status.replace(/_/g, " ") })).toBeVisible();

    await page.getByRole("link", { name: DEFAULT_CLUSTER.name }).click();
    await page.waitForURL(`/kubernetes/clusters/${DEFAULT_CLUSTER.uuid}`);

    await expect(page.getByRole("heading", { name: DEFAULT_CLUSTER.name })).toBeVisible();
    await expect(page.getByText(DEFAULT_CLUSTER.status.replace(/_/g, " "))).toBeVisible();
    await expect(page.getByText(DEFAULT_CLUSTER_TEMPLATE.name)).toBeVisible();

    await page.getByRole("tab", { name: "Node groups" }).click();
    for (const nodegroup of DEFAULT_CLUSTER.nodegroups ?? []) {
      await expect(page.getByRole("cell", { name: nodegroup.name })).toBeVisible();
    }

    await page.getByRole("tab", { name: "Events" }).click();
    await expect(page.getByRole("cell", { name: "Cluster demo-magnum-cluster creation complete." })).toBeVisible();
  });
});

