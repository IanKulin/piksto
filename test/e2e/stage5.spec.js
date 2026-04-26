import { test, expect } from "@playwright/test";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures");
const DB_PATH = process.env.DB_PATH;

async function uploadImage(page, filename) {
  await page.goto("/");
  await page
    .locator('input[type="file"][name="image"]')
    .setInputFiles(path.join(FIXTURES, filename));
  await page.locator('form[action="/upload/file"] button[type="submit"]').click();
  await page.waitForURL("/?success=1");
}

async function getLastImageId() {
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare("SELECT id FROM images ORDER BY id DESC LIMIT 1").get();
  db.close();
  return row ? row.id : null;
}

test.describe("Stage 5 — Image Detail, Download & Delete", () => {
  test("clicking a gallery card navigates to /image/:id detail page", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    await page.goto("/allimages");
    await page.locator(".gallery-card").first().click();
    await expect(page).toHaveURL(/\/image\/\d+/);
    expect(page.url()).toMatch(/\/image\/\d+$/);
  });

  test("GET /image/:id renders a full-size image", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    const id = await getLastImageId();
    await page.goto(`/image/${id}`);
    const img = page.locator(".image-detail img");
    await expect(img).toBeVisible();
    const src = await img.getAttribute("src");
    expect(src).toMatch(/^\/image\/\d+\.\w+$/);
  });

  test("download link has correct href and download attribute", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    const id = await getLastImageId();
    await page.goto(`/image/${id}`);
    const link = page.locator(`a[href="/image/${id}/download"]`);
    await expect(link).toBeVisible();
    const downloadAttr = await link.getAttribute("download");
    expect(downloadAttr).not.toBeNull();
  });

  test("GET /image/:id/download triggers file download with correct filename", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    const id = await getLastImageId();
    await page.goto(`/image/${id}`);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(`a[href="/image/${id}/download"]`).click(),
    ]);

    expect(download.suggestedFilename()).toBe(`photo-${id}.jpg`);
  });

  test("download for a PNG image has .png extension", async ({ page }) => {
    await uploadImage(page, "green.png");
    const id = await getLastImageId();
    await page.goto(`/image/${id}`);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(`a[href="/image/${id}/download"]`).click(),
    ]);

    expect(download.suggestedFilename()).toBe(`photo-${id}.png`);
  });

  test("download for a WebP image has .webp extension", async ({ page }) => {
    await uploadImage(page, "blue.webp");
    const id = await getLastImageId();
    await page.goto(`/image/${id}`);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(`a[href="/image/${id}/download"]`).click(),
    ]);

    expect(download.suggestedFilename()).toBe(`photo-${id}.webp`);
  });

  test("delete button removes image and redirects to gallery", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    const id = await getLastImageId();
    await page.goto(`/image/${id}`);

    await page.locator('a[href="#confirm-delete"]').click();
    await page.locator('form[action$="/delete"] button[type="submit"]').click();
    await expect(page).toHaveURL("/allimages");

    // Image no longer accessible
    const res = await page.goto(`/image/${id}`);
    expect(res.status()).toBe(404);
  });

  test("deleted image no longer appears in gallery", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    const id = await getLastImageId();
    await page.goto(`/image/${id}`);
    await page.locator('a[href="#confirm-delete"]').click();
    await page.locator('form[action$="/delete"] button[type="submit"]').click();
    await expect(page).toHaveURL("/allimages");

    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT id FROM images WHERE id = ?").get(id);
    db.close();
    expect(row).toBeUndefined();
  });

  test("GET /image/9999 returns 404", async ({ page }) => {
    const res = await page.goto("/image/9999");
    expect(res.status()).toBe(404);
  });

  test("back to gallery link is present and works", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    const id = await getLastImageId();
    await page.goto(`/image/${id}`);

    const backLink = page.locator('a[href="/allimages"]').first();
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL("/allimages");
  });

  test("delete form uses POST method", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    const id = await getLastImageId();
    await page.goto(`/image/${id}`);

    await page.locator('a[href="#confirm-delete"]').click();
    const form = page.locator(`form[action="/image/${id}/delete"]`);
    await expect(form).toBeVisible();
    const method = await form.getAttribute("method");
    expect(method?.toUpperCase()).toBe("POST");
  });

  test("GET /image/:id/download sets Content-Disposition attachment header", async ({
    page,
    request,
  }) => {
    await uploadImage(page, "red.jpg");
    const id = await getLastImageId();
    const response = await request.get(`/image/${id}/download`);
    expect(response.status()).toBe(200);
    const disposition = response.headers()["content-disposition"];
    expect(disposition).toMatch(/attachment/);
    expect(disposition).toMatch(new RegExp(`photo-${id}\\.jpg`));
  });

  test("GET /image/:id/download sets correct Content-Type for JPEG", async ({ page, request }) => {
    await uploadImage(page, "red.jpg");
    const id = await getLastImageId();
    const response = await request.get(`/image/${id}/download`);
    const contentType = response.headers()["content-type"];
    expect(contentType).toMatch(/image\/jpeg/);
  });

  test("corrupted image auth tag on detail page returns 500", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    const id = await getLastImageId();

    const db = new Database(DB_PATH);
    db.prepare("UPDATE images SET auth_tag_image = ? WHERE id = ?").run(Buffer.alloc(16, 0x00), id);
    db.close();

    const res = await page.goto(`/image/${id}.jpg`);
    expect(res.status()).toBe(500);

    // Clean up
    const db2 = new Database(DB_PATH);
    db2.prepare("DELETE FROM images WHERE id = ?").run(id);
    db2.close();
  });
});
