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

async function createCollection(page, name) {
  await page.goto("/collections");
  await page.locator("#collections-add-btn").click();
  await page.locator('#create-modal input[name="name"]').fill(name);
  await page.locator('#create-modal button[type="submit"]').click();
  await page.waitForURL("/collections");
}

async function deleteAllCollections(page) {
  await page.goto("/collections");
  const selectBtn = page.locator("#collections-select-btn");
  if (!(await selectBtn.isVisible())) return;
  await selectBtn.click();
  const checkboxes = page.locator(".collection-card__checkbox");
  const count = await checkboxes.count();
  if (count === 0) return;
  for (let i = 0; i < count; i++) {
    await checkboxes.nth(i).check();
  }
  // Delete button is dynamically created in select mode
  await page.locator("#gallery-toolbar-actions .btn--danger").click();
  await page.locator("#bulk-confirm-btn").click();
  await page.waitForURL("/collections");
}

test.describe("Stage 12 — Add to Collection Modal", () => {
  test("GET /api/collections returns JSON array", async ({ request }) => {
    const res = await request.get("/api/collections");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/collections returns id, name, slug fields", async ({ page, request }) => {
    await createCollection(page, `ApiFields-${Date.now()}`);
    const res = await request.get("/api/collections");
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    const col = body[body.length - 1];
    expect(col).toHaveProperty("id");
    expect(col).toHaveProperty("name");
    expect(col).toHaveProperty("slug");
  });

  test("POST toggle adds image to collection", async ({ page, request }) => {
    const tag = Date.now();
    await createCollection(page, `ToggleAdd-${tag}`);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const cols = await colsRes.json();
    const col = cols.find((c) => c.name === `ToggleAdd-${tag}`);

    const res = await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ added: true });

    const memberRes = await request.get(`/api/image/${imageId}/collections`);
    const members = await memberRes.json();
    expect(members.some((c) => c.id === col.id)).toBe(true);
  });

  test("POST toggle twice removes image from collection", async ({ page, request }) => {
    const tag = Date.now();
    await createCollection(page, `ToggleRemove-${tag}`);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const cols = await colsRes.json();
    const col = cols.find((c) => c.name === `ToggleRemove-${tag}`);

    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);
    const res = await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);
    const body = await res.json();
    expect(body).toEqual({ added: false });

    const memberRes = await request.get(`/api/image/${imageId}/collections`);
    const members = await memberRes.json();
    expect(members.some((c) => c.id === col.id)).toBe(false);
  });

  test("GET /api/image/:id/collections returns collections for image", async ({
    page,
    request,
  }) => {
    const tag = Date.now();
    await createCollection(page, `MemberCheck-${tag}`);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const cols = await colsRes.json();
    const col = cols.find((c) => c.name === `MemberCheck-${tag}`);

    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    const memberRes = await request.get(`/api/image/${imageId}/collections`);
    expect(memberRes.status()).toBe(200);
    const members = await memberRes.json();
    expect(Array.isArray(members)).toBe(true);
    const found = members.find((c) => c.id === col.id);
    expect(found).toBeDefined();
    expect(found).toHaveProperty("id");
    expect(found).toHaveProperty("name");
    expect(found).toHaveProperty("slug");
  });

  test("modal opens when Add to collection clicked in select mode", async ({ page }) => {
    await createCollection(page, `ModalOpen-${Date.now()}`);
    await uploadImage(page, "red.jpg");

    await page.goto("/allimages");
    await page.locator("#gallery-select-btn").click();
    await page.locator(".gallery-card__checkbox").first().check();
    await page.locator("button", { hasText: "Add to collection" }).click();

    await expect(page.locator("#atc-modal")).toBeVisible();
  });

  test("modal lists collections", async ({ page }) => {
    const tag = Date.now();
    await createCollection(page, `ModalList-${tag}`);
    await uploadImage(page, "red.jpg");

    await page.goto("/allimages");
    await page.locator("#gallery-select-btn").click();
    await page.locator(".gallery-card__checkbox").first().check();
    await page.locator("button", { hasText: "Add to collection" }).click();

    await expect(page.locator("#atc-modal")).toBeVisible();
    await expect(page.locator("#atc-list")).toContainText(`ModalList-${tag}`);
  });

  test("modal shows pre-checked state when image already in collection", async ({
    page,
    request,
  }) => {
    const tag = Date.now();
    await createCollection(page, `PreChecked-${tag}`);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const cols = await colsRes.json();
    const col = cols.find((c) => c.name === `PreChecked-${tag}`);
    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    await page.goto("/allimages");
    await page.locator("#gallery-select-btn").click();
    await page.locator(`.gallery-card[data-id="${imageId}"] .gallery-card__checkbox`).check();
    await page.locator("button", { hasText: "Add to collection" }).click();

    await expect(page.locator("#atc-modal")).toBeVisible();
    await page.waitForSelector("#atc-list .atc-row");

    const cb = page
      .locator("#atc-list .atc-row")
      .filter({ hasText: `PreChecked-${tag}` })
      .locator("input[type=checkbox]");
    await expect(cb).toBeChecked();
  });

  test("toggling checkbox in modal adds image to collection", async ({ page, request }) => {
    const tag = Date.now();
    await createCollection(page, `PulseTest-${tag}`);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();

    await page.goto("/allimages");
    await page.locator("#gallery-select-btn").click();
    await page.locator(`.gallery-card[data-id="${imageId}"] .gallery-card__checkbox`).check();
    await page.locator("button", { hasText: "Add to collection" }).click();

    await expect(page.locator("#atc-modal")).toBeVisible();
    await page.waitForSelector("#atc-list .atc-row");

    const row = page.locator("#atc-list .atc-row").filter({ hasText: `PulseTest-${tag}` });
    const cb = row.locator("input[type=checkbox]");
    await cb.check();

    await page.locator("#atc-close-btn").click();

    const memberRes = await request.get(`/api/image/${imageId}/collections`);
    const members = await memberRes.json();
    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === `PulseTest-${tag}`);
    expect(members.some((c) => c.id === col.id)).toBe(true);
  });

  test("modal shows empty state when no collections exist", async ({ page }) => {
    await deleteAllCollections(page);
    await uploadImage(page, "red.jpg");

    await page.goto("/allimages");
    await page.locator("#gallery-select-btn").click();
    await page.locator(".gallery-card__checkbox").first().check();
    await page.locator("button", { hasText: "Add to collection" }).click();

    await expect(page.locator("#atc-modal")).toBeVisible();
    await expect(page.locator("#atc-empty")).toBeVisible();
  });

  test("modal closes on Escape key", async ({ page }) => {
    await createCollection(page, `EscapeTest-${Date.now()}`);
    await uploadImage(page, "red.jpg");

    await page.goto("/allimages");
    await page.locator("#gallery-select-btn").click();
    await page.locator(".gallery-card__checkbox").first().check();
    await page.locator("button", { hasText: "Add to collection" }).click();
    await expect(page.locator("#atc-modal")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#atc-modal")).toBeHidden();
  });

  test("modal works from collection detail view", async ({ page, request }) => {
    const tag = Date.now();
    await createCollection(page, `DetailSrc-${tag}`);
    await createCollection(page, `DetailTarget-${tag}`);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const cols = await colsRes.json();
    const src = cols.find((c) => c.name === `DetailSrc-${tag}`);
    await request.post(`/api/image/${imageId}/collections/${src.id}/toggle`);

    await page.goto(`/collections/${src.slug}`);
    await page.locator("#gallery-select-btn").click();
    await page.locator(".gallery-card__checkbox").first().check();
    await page.locator("button", { hasText: "Add to collection" }).click();

    await expect(page.locator("#atc-modal")).toBeVisible();
    await expect(page.locator("#atc-list")).toContainText(`DetailTarget-${tag}`);
  });

  test("after adding via toggle, collection cover image updates", async ({ page, request }) => {
    const tag = Date.now();
    await createCollection(page, `CoverUpdate-${tag}`);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === `CoverUpdate-${tag}`);
    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    await page.goto("/collections");
    const card = page.locator(".collection-card").filter({ hasText: `CoverUpdate-${tag}` });
    const coverImg = card.locator("img");
    await expect(coverImg).toHaveAttribute("src", `/image/${imageId}/thumb.jpg`);
  });

  test("invalid image ID returns 400 from toggle endpoint", async ({ request }) => {
    const res = await request.post("/api/image/abc/collections/1/toggle");
    expect(res.status()).toBe(400);
  });

  test("invalid collection ID returns 400 from toggle endpoint", async ({ page, request }) => {
    await uploadImage(page, "red.jpg");
    const imageId = await getLastImageId();
    const res = await request.post(`/api/image/${imageId}/collections/abc/toggle`);
    expect(res.status()).toBe(400);
  });
});
