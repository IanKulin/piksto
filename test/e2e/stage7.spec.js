import { test, expect } from "@playwright/test";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures");
const DB_PATH = process.env.DB_PATH;

function clearDb() {
  const db = new Database(DB_PATH);
  db.exec("DELETE FROM images");
  db.close();
}

async function uploadFixture(page, filename) {
  await page.goto("/");
  await page
    .locator('input[type="file"][name="image"]')
    .setInputFiles(path.join(FIXTURES, filename));
  await page.locator('form[action="/upload/file"] button[type="submit"]').click();
  await page.waitForURL("/?success=1", { timeout: 15_000 });
}

test.describe("Stage 7 — Bulk Delete", () => {
  test.beforeEach(() => {
    clearDb();
  });

  test("toolbar is hidden on load with images present", async ({ page }) => {
    await uploadFixture(page, "red.jpg");
    await page.goto("/gallery");
    await expect(page.locator("#bulk-toolbar")).toBeHidden();
  });

  test("toolbar appears after checking a box", async ({ page }) => {
    await uploadFixture(page, "red.jpg");
    await page.goto("/gallery");
    await page.locator(".gallery-card__checkbox").first().check();
    await expect(page.locator("#bulk-toolbar")).toBeVisible();
  });

  test("select all checks all checkboxes", async ({ page }) => {
    await uploadFixture(page, "red.jpg");
    await uploadFixture(page, "green.png");
    await page.goto("/gallery");

    // Check one box first to show the toolbar, then select all
    await page.locator(".gallery-card__checkbox").first().check();
    await page.locator("#bulk-select-all").click();

    const checkboxes = page.locator(".gallery-card__checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }
  });

  test("clear unchecks all checkboxes and hides toolbar", async ({ page }) => {
    await uploadFixture(page, "red.jpg");
    await uploadFixture(page, "green.png");
    await page.goto("/gallery");

    // Check one box first to show the toolbar, then select all, then clear
    await page.locator(".gallery-card__checkbox").first().check();
    await page.locator("#bulk-select-all").click();
    await page.locator("#bulk-clear").click();

    const checkboxes = page.locator(".gallery-card__checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).not.toBeChecked();
    }
    await expect(page.locator("#bulk-toolbar")).toBeHidden();
  });

  test("cancel modal closes modal without deleting images", async ({ page }) => {
    await uploadFixture(page, "red.jpg");
    await page.goto("/gallery");

    await page.locator(".gallery-card__checkbox").first().check();
    await page.locator("#bulk-delete-btn").click();
    await expect(page.locator("#bulk-modal")).toBeVisible();

    await page.locator("#bulk-cancel-btn").click();
    await expect(page.locator("#bulk-modal")).toBeHidden();
    await expect(page.locator(".gallery-card")).toHaveCount(1);
  });

  test("select and delete two of three images, one remains", async ({ page }) => {
    await uploadFixture(page, "red.jpg");
    await uploadFixture(page, "green.png");
    await uploadFixture(page, "blue.webp");
    await page.goto("/gallery");

    const checkboxes = page.locator(".gallery-card__checkbox");
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    await page.locator("#bulk-delete-btn").click();
    await expect(page.locator("#bulk-modal")).toBeVisible();
    await page.locator("#bulk-confirm-btn").click();

    await page.waitForURL("/gallery", { timeout: 15_000 });
    await expect(page.locator(".gallery-card")).toHaveCount(1);
  });

  test("empty state shown after deleting all images", async ({ page }) => {
    await uploadFixture(page, "red.jpg");
    await page.goto("/gallery");

    await page.locator(".gallery-card__checkbox").first().check();
    await page.locator("#bulk-delete-btn").click();
    await page.locator("#bulk-confirm-btn").click();

    await page.waitForURL("/gallery", { timeout: 15_000 });
    await expect(page.locator(".gallery-empty")).toBeVisible();
  });

  test("selection is not preserved after navigating away and back", async ({ page }) => {
    await uploadFixture(page, "red.jpg");
    await page.goto("/gallery");

    await page.locator(".gallery-card__checkbox").first().check();
    await page.goto("/");
    await page.goto("/gallery");

    await expect(page.locator(".gallery-card__checkbox").first()).not.toBeChecked();
    await expect(page.locator("#bulk-toolbar")).toBeHidden();
  });
});
