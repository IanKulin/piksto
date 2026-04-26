import { test, expect } from "@playwright/test";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures");

// Helper: upload a fixture image via the file form and wait for success
async function uploadImage(page, filename) {
  await page.goto("/");
  await page
    .locator('input[type="file"][name="image"]')
    .setInputFiles(path.join(FIXTURES, filename));
  await page.locator('form[action="/upload/file"] button[type="submit"]').click();
  await page.waitForURL("/?success=1");
}

test.describe("Stage 4 — Gallery Page", () => {
  test("GET /allimages renders without error", async ({ page }) => {
    const res = await page.goto("/allimages");
    expect(res.status()).toBe(200);
  });

  test("empty gallery shows friendly message with upload link", async ({ page }) => {
    // Use a fresh in-memory read to check if gallery might be empty;
    // regardless, the empty-state markup must exist in the template.
    // We check by looking at DB state first.
    const db = new Database(process.env.DB_PATH, { readonly: true });
    const count = db.prepare("SELECT COUNT(*) as n FROM images").get().n;
    db.close();

    if (count === 0) {
      await page.goto("/allimages");
      await expect(page.locator(".gallery-empty")).toBeVisible();
      await expect(page.locator('.gallery-empty a[href="/"]')).toBeVisible();
    } else {
      // Skip assertion — gallery has images, empty state won't show
      test.skip();
    }
  });

  test("after uploading an image, gallery shows at least one thumbnail card", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    await page.goto("/allimages");
    const cards = page.locator(".gallery-card");
    await expect(cards.first()).toBeVisible();
  });

  test("gallery thumbnail images have a valid src (thumb URL)", async ({ page }) => {
    await uploadImage(page, "green.png");
    await page.goto("/allimages");
    const firstImg = page.locator(".gallery-card img").first();
    await expect(firstImg).toBeVisible();
    const src = await firstImg.getAttribute("src");
    expect(src).toMatch(/^\/image\/\d+\/thumb\.jpg$/);
  });

  test("each gallery card shows an upload date", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    await page.goto("/allimages");
    const date = page.locator(".gallery-card__date").first();
    await expect(date).toBeVisible();
    const text = await date.textContent();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test("clicking a gallery card navigates to /image/:id", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    await page.goto("/allimages");
    await page.locator(".gallery-card").first().click();
    await expect(page).toHaveURL(/\/image\/\d+/);
  });

  test("gallery grid layout is present in DOM", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    await page.goto("/allimages");
    await expect(page.locator(".gallery-grid")).toBeVisible();
  });

  test("nav link to /allimages is present in header", async ({ page }) => {
    await page.goto("/allimages");
    await expect(page.locator('header a[href="/allimages"]')).toBeVisible();
  });

  test("multiple uploaded images all appear in the gallery", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    await uploadImage(page, "green.png");
    await uploadImage(page, "blue.webp");

    await page.goto("/allimages");
    const db = new Database(process.env.DB_PATH, { readonly: true });
    const totalCount = db.prepare("SELECT COUNT(*) as n FROM images").get().n;
    db.close();

    const cards = page.locator(".gallery-card");
    await expect(cards).toHaveCount(totalCount);
  });

  test("gallery cards link href matches /image/:id pattern", async ({ page }) => {
    await uploadImage(page, "red.jpg");
    await page.goto("/allimages");
    const hrefs = await page
      .locator(".gallery-card__link")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    for (const href of hrefs) {
      expect(href).toMatch(/^\/image\/\d+$/);
    }
  });

  test("corrupted auth tag causes 500 on thumbnail route", async ({ page, request }) => {
    // Upload an image so there is at least one row
    await uploadImage(page, "red.jpg");

    // Corrupt the auth_tag_thumb of the most-recent row
    const db = new Database(process.env.DB_PATH);
    const row = db.prepare("SELECT id FROM images ORDER BY id DESC LIMIT 1").get();
    db.prepare("UPDATE images SET auth_tag_thumb = ? WHERE id = ?").run(
      Buffer.alloc(16, 0x00),
      row.id
    );
    db.close();

    const res = await request.get(`/image/${row.id}/thumb.jpg`);
    expect(res.status()).toBe(500);

    // Restore: delete the corrupted row so other tests aren't affected
    const db2 = new Database(process.env.DB_PATH);
    db2.prepare("DELETE FROM images WHERE id = ?").run(row.id);
    db2.close();
  });
});
