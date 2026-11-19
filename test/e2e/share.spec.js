import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import sharp from "sharp";

const DB_PATH = process.env.DB_PATH;
const ANON = { cookies: [], origins: [] };

function withDb(fn) {
  const db = new Database(DB_PATH);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

async function exifJpeg(color) {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "secret-owner" } })
    .toBuffer();
}

async function uploadBuffer(page, buffer) {
  await page.goto("/");
  await page.locator('input[type="file"][name="image"]').setInputFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer,
  });
  await page.locator('form[action="/upload/file"] button[type="submit"]').click();
  await page.waitForURL("/?success=1");
  return withDb((db) => db.prepare("SELECT id FROM images ORDER BY id DESC LIMIT 1").get().id);
}

async function createCollection(page, name) {
  await page.goto("/collections");
  await page.locator("#collections-add-btn").click();
  await page.locator('#create-modal input[name="name"]').fill(name);
  await page.locator('#create-modal button[type="submit"]').click();
  await page.waitForURL("/collections");
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function addToCollection(imageId, slugName) {
  withDb((db) => {
    // Collection names are encrypted, so find the newest collection instead.
    const row = db.prepare("SELECT id FROM collections ORDER BY id DESC LIMIT 1").get();
    db.prepare(
      "INSERT OR IGNORE INTO image_collections (image_id, collection_id) VALUES (?, ?)"
    ).run(imageId, row.id);
  });
  return slugName;
}

async function createShare(page, slug, { password = "", expiry = "1d", strip = true } = {}) {
  await page.goto(`/collections/${slug}`);
  await page.locator("#share-open-btn").click();
  await page.locator("#share-password").fill(password);
  await page.locator("#share-expiry").selectOption(expiry);
  const box = page.locator('input[name="strip_metadata"]');
  if (strip) await box.check();
  else await box.uncheck();
  await page.locator("#share-create-btn").click();
  const url = await page.locator("#share-new-url").inputValue();
  return url;
}

async function setup(page, name) {
  const imageId = await uploadBuffer(page, await exifJpeg("red"));
  const slug = await createCollection(page, name);
  addToCollection(imageId, slug);
  return { imageId, slug };
}

test.describe("shared collections", () => {
  test("owner creates a share; anonymous visitor sees a bare grid", async ({ page, browser }) => {
    const { imageId, slug } = await setup(page, "Share Basic");
    const url = await createShare(page, slug);
    expect(url).toMatch(/\/share\/[A-Za-z0-9_-]{43}$/);

    const visitor = await browser.newContext({ storageState: ANON });
    const vp = await visitor.newPage();
    await vp.goto(url);
    await expect(vp.locator("h1")).toHaveText("Share Basic");
    await expect(vp.locator(".image-card")).toHaveCount(1);
    await expect(vp.locator("time")).toHaveCount(0);
    await expect(vp.locator("nav")).toHaveCount(0);
    await expect(vp.locator('a[href="/"]')).toHaveCount(0);
    expect(await vp.content()).not.toContain("<script");

    const res = await visitor.request.get(`${url}/image/${imageId}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/jpeg");
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
    expect(res.headers()["etag"]).toBeUndefined();
    const thumb = await visitor.request.get(`${url}/image/${imageId}/thumb.jpg`);
    expect(thumb.status()).toBe(200);
    await visitor.close();
  });

  test("management list shows no link for existing shares and labels expired ones", async ({
    page,
  }) => {
    const { slug } = await setup(page, "Share List");
    await createShare(page, slug);
    withDb((db) =>
      db
        .prepare(
          "INSERT INTO shares (collection_id, token_hash, strip_metadata, expires_at) VALUES ((SELECT MAX(id) FROM collections), 'expired-hash', 1, '2000-01-01T00:00:00.000Z')"
        )
        .run()
    );
    await page.goto(`/collections/${slug}`);
    await page.locator("#share-open-btn").click();
    await expect(page.locator(".share-list__item")).toHaveCount(2);
    await expect(page.locator(".share-list")).toContainText("Expired");
    await expect(page.locator("#share-new-url")).toHaveCount(0);
  });

  test("image not in the collection returns 404, including after removal", async ({
    page,
    browser,
  }) => {
    const { imageId, slug } = await setup(page, "Share Membership");
    const outsider = await uploadBuffer(page, await exifJpeg("blue"));
    const url = await createShare(page, slug);
    const visitor = await browser.newContext({ storageState: ANON });
    expect((await visitor.request.get(`${url}/image/${outsider}`)).status()).toBe(404);
    expect((await visitor.request.get(`${url}/image/${imageId}`)).status()).toBe(200);
    withDb((db) => db.prepare("DELETE FROM image_collections WHERE image_id = ?").run(imageId));
    expect((await visitor.request.get(`${url}/image/${imageId}`)).status()).toBe(404);
    expect((await visitor.request.get(`${url}/image/${imageId}/thumb.jpg`)).status()).toBe(404);
    await visitor.close();
  });

  test("strip on removes EXIF; strip off keeps it", async ({ page, browser }) => {
    const { imageId, slug } = await setup(page, "Share Exif");
    const stripped = await createShare(page, slug, { strip: true });
    const kept = await createShare(page, slug, { strip: false });
    const visitor = await browser.newContext({ storageState: ANON });
    const a = await visitor.request.get(`${stripped}/image/${imageId}`);
    const b = await visitor.request.get(`${kept}/image/${imageId}`);
    expect((await sharp(await a.body()).metadata()).exif).toBeUndefined();
    expect((await sharp(await b.body()).metadata()).exif).toBeDefined();
    await visitor.close();
  });

  test("password share hides the grid until unlocked", async ({ page, browser }) => {
    const { imageId, slug } = await setup(page, "Share Password");
    const url = await createShare(page, slug, { password: "hunter2" });
    const visitor = await browser.newContext({ storageState: ANON });
    const vp = await visitor.newPage();
    await vp.goto(url);
    await expect(vp.locator(".image-card")).toHaveCount(0);
    expect((await visitor.request.get(`${url}/image/${imageId}/thumb.jpg`)).status()).toBe(401);

    await vp.fill('input[name="password"]', "wrong");
    await vp.click('button[type="submit"]');
    await expect(vp.locator(".banner--error")).toBeVisible();
    await expect(vp.locator(".image-card")).toHaveCount(0);

    await vp.fill('input[name="password"]', "hunter2");
    await vp.click('button[type="submit"]');
    await expect(vp.locator(".image-card")).toHaveCount(1);
    expect((await visitor.request.get(`${url}/image/${imageId}/thumb.jpg`)).status()).toBe(200);
    await visitor.close();
  });

  test("viewer frame has prev/next, preload and no date; locked and outside ids 404", async ({
    page,
    browser,
  }) => {
    const first = await uploadBuffer(page, await exifJpeg("red"));
    const second = await uploadBuffer(page, await exifJpeg("blue"));
    const slug = await createCollection(page, "Share Viewer");
    addToCollection(first, slug);
    addToCollection(second, slug);
    const url = await createShare(page, slug);

    const visitor = await browser.newContext({ storageState: ANON });
    const vp = await visitor.newPage();
    await vp.goto(url);
    await vp.locator(".image-card__link").first().click();
    await expect(vp).toHaveURL(/\/share\/[^/]+\/view\/\d+$/);
    await expect(vp.locator(".image-detail__img")).toHaveAttribute("src", /\/image\/\d+$/);
    await expect(vp.locator("time")).toHaveCount(0);
    await expect(vp.locator(".image-shelf__meta")).toHaveText("");
    await expect(vp.locator("nav")).toHaveCount(0);
    const link = vp.locator('link[rel="prefetch"]');
    const hasNext = (await link.count()) === 1;
    const nextBtn = vp.locator("a.image-shelf__nav-btn", { hasText: "Next" });
    const prevBtn = vp.locator("a.image-shelf__nav-btn", { hasText: "Prev" });
    // Exactly one direction is available from the first or last grid item; walk to the other.
    if (hasNext) {
      await nextBtn.click();
      await expect(prevBtn).toHaveCount(1);
      await expect(vp.locator('link[rel="prefetch"]')).toHaveCount(0);
    } else {
      await prevBtn.click();
      await expect(nextBtn).toHaveCount(1);
    }
    await expect(vp.locator("a[download]")).toHaveAttribute("href", /\/image\/\d+$/);

    const outsider = await uploadBuffer(page, await exifJpeg("green"));
    expect((await visitor.request.get(`${url}/view/${outsider}`)).status()).toBe(404);
    await visitor.close();
  });

  test("viewer page respects the password lock", async ({ page, browser }) => {
    const { imageId, slug } = await setup(page, "Share Viewer Lock");
    const url = await createShare(page, slug, { password: "hunter2" });
    const visitor = await browser.newContext({ storageState: ANON });
    const vp = await visitor.newPage();
    await vp.goto(`${url}/view/${imageId}`);
    await expect(vp.locator('input[name="password"]')).toBeVisible();
    await expect(vp.locator(".image-detail__img")).toHaveCount(0);
    await visitor.close();
  });

  test("expired share looks identical to an unknown token", async ({ page, browser }) => {
    const { slug } = await setup(page, "Share Expired");
    const url = await createShare(page, slug);
    withDb((db) => db.prepare("UPDATE shares SET expires_at = '2000-01-01T00:00:00.000Z'").run());
    const visitor = await browser.newContext({ storageState: ANON });
    const expired = await visitor.request.get(url);
    const unknown = await visitor.request.get("/share/not-a-real-token");
    expect(expired.status()).toBe(404);
    expect(unknown.status()).toBe(404);
    expect(await expired.text()).toBe(await unknown.text());
    await visitor.close();
  });

  test("revoking a share kills only that link; deleting the collection removes shares", async ({
    page,
    browser,
  }) => {
    const { slug } = await setup(page, "Share Revoke");
    const first = await createShare(page, slug);
    const second = await createShare(page, slug);
    await page.goto(`/collections/${slug}?shares=1`);
    await page.locator(".share-list__item button").first().click(); // newest = second
    const visitor = await browser.newContext({ storageState: ANON });
    expect((await visitor.request.get(second)).status()).toBe(404);
    expect((await visitor.request.get(first)).status()).toBe(200);

    withDb((db) =>
      db.prepare("DELETE FROM collections WHERE id = (SELECT MAX(id) FROM collections)").run()
    );
    expect((await visitor.request.get(first)).status()).toBe(404);
    await visitor.close();
  });

  test("public pages show no authenticated nav; authenticated routes still redirect", async ({
    page,
    browser,
  }) => {
    const visitor = await browser.newContext({ storageState: ANON });
    const vp = await visitor.newPage();
    for (const path of ["/login", "/nope"]) {
      await vp.goto(path);
      await expect(vp.locator(".site-nav")).toHaveCount(0);
      await expect(vp.locator('a[href="/allimages"]')).toHaveCount(0);
    }
    for (const path of ["/allimages", "/image/1", "/collections"]) {
      await vp.goto(path);
      await expect(vp).toHaveURL(/\/login$/);
    }
    await visitor.close();

    await page.goto("/nope");
    await expect(page.locator(".site-nav")).toBeVisible();
  });
});
