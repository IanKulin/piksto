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

test.describe("POST /collections — error paths", () => {
  test("empty name shows error", async ({ request }) => {
    const res = await request.post("/collections", { form: { name: "" } });
    expect(res.status()).toBe(400);
    const body = await res.text();
    expect(body).toContain("Name is required.");
  });

  test("symbol-only name shows error", async ({ page }) => {
    await page.goto("/collections");
    await page.locator("#collections-add-btn").click();
    await page.locator('#create-modal input[name="name"]').fill("!!!");
    await page.locator('#create-modal button[type="submit"]').click();
    await expect(page).toHaveURL("/collections");
    await expect(page.locator("body")).toContainText(
      "Name must contain at least one letter or number."
    );
  });

  test("duplicate slug shows error", async ({ page }) => {
    const name = `Holidays-${Date.now()}`;
    await createCollection(page, name);
    await page.goto("/collections");
    await page.locator("#collections-add-btn").click();
    await page.locator('#create-modal input[name="name"]').fill(name);
    await page.locator('#create-modal button[type="submit"]').click();
    await expect(page).toHaveURL("/collections");
    await expect(page.locator("body")).toContainText(
      "A collection with a similar name already exists."
    );
  });
});

test.describe("POST /collections/delete — bulk delete collections", () => {
  test("bulk delete redirects to /collections and removes collections", async ({
    page,
    request,
  }) => {
    const tag = Date.now();
    const nameA = `BulkA-${tag}`;
    const nameB = `BulkB-${tag}`;
    await createCollection(page, nameA);
    await createCollection(page, nameB);

    const colsRes = await request.get("/api/collections");
    const cols = await colsRes.json();
    const colA = cols.find((c) => c.name === nameA);
    const colB = cols.find((c) => c.name === nameB);

    const params = new URLSearchParams();
    params.append("ids", String(colA.id));
    params.append("ids", String(colB.id));
    const res = await request.post("/collections/delete", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: params.toString(),
    });
    expect(res.url()).toMatch(/\/collections$/);

    await page.goto("/collections");
    await expect(page.locator("body")).not.toContainText(nameA);
    await expect(page.locator("body")).not.toContainText(nameB);
  });

  test("empty ids is a no-op and redirects to /collections", async ({ request }) => {
    const res = await request.post("/collections/delete", { form: {} });
    expect(res.url()).toMatch(/\/collections$/);
    expect(res.status()).toBe(200);
  });
});

test.describe("POST /collections/:slug/remove — remove images from collection", () => {
  test("remove one image redirects back to collection", async ({ page, request }) => {
    const tag = Date.now();
    const colName = `Remove-${tag}`;
    await createCollection(page, colName);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === colName);
    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    const res = await request.post(`/collections/${col.slug}/remove`, {
      form: { ids: [String(imageId)] },
    });
    expect(res.url()).toMatch(new RegExp(`/collections/${col.slug}$`));
  });

  test("removed image no longer appears in collection detail", async ({ page, request }) => {
    const tag = Date.now();
    const colName = `RemoveVis-${tag}`;
    await createCollection(page, colName);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === colName);
    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    await request.post(`/collections/${col.slug}/remove`, {
      form: { ids: [String(imageId)] },
    });

    await page.goto(`/collections/${col.slug}`);
    await expect(page.locator(`img[src="/image/${imageId}/thumb.jpg"]`)).not.toBeVisible();
  });

  test("removed image still exists globally", async ({ page, request }) => {
    const tag = Date.now();
    const colName = `RemoveGlobal-${tag}`;
    await createCollection(page, colName);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === colName);
    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    await request.post(`/collections/${col.slug}/remove`, {
      form: { ids: [String(imageId)] },
    });

    const res = await request.get(`/image/${imageId}/thumb.jpg`);
    expect(res.status()).toBe(200);
  });

  test("returnTo param is respected", async ({ page, request }) => {
    const tag = Date.now();
    const colName = `ReturnTo-${tag}`;
    await createCollection(page, colName);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === colName);
    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    const res = await request.post(`/collections/${col.slug}/remove`, {
      form: { ids: [String(imageId)], returnTo: "/allimages" },
    });
    expect(res.url()).toMatch(/\/allimages$/);
  });

  test("empty ids is a no-op and redirects to collection", async ({ request }) => {
    const tag = Date.now();
    const colName = `RemoveNoop-${tag}`;

    const createRes = await request.post("/collections", { form: { name: colName } });
    expect(createRes.url()).toMatch(/\/collections$/);

    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === colName);

    const res = await request.post(`/collections/${col.slug}/remove`, { form: {} });
    expect(res.url()).toMatch(new RegExp(`/collections/${col.slug}$`));
  });
});

test.describe("POST /collections/:slug/delete — permanently delete images from collection", () => {
  test("delete one image redirects to collection", async ({ page, request }) => {
    const tag = Date.now();
    const colName = `PermDel-${tag}`;
    await createCollection(page, colName);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === colName);
    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    const res = await request.post(`/collections/${col.slug}/delete`, {
      form: { ids: [String(imageId)] },
    });
    expect(res.url()).toMatch(new RegExp(`/collections/${col.slug}$`));
  });

  test("deleted image is gone globally", async ({ page, request }) => {
    const tag = Date.now();
    const colName = `PermDelGone-${tag}`;
    await createCollection(page, colName);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === colName);
    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    await request.post(`/collections/${col.slug}/delete`, {
      form: { ids: [String(imageId)] },
    });

    const res = await request.get(`/image/${imageId}/thumb.jpg`);
    expect(res.status()).toBe(404);
  });

  test("deleted image no longer appears in collection", async ({ page, request }) => {
    const tag = Date.now();
    const colName = `PermDelVis-${tag}`;
    await createCollection(page, colName);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === colName);
    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    await request.post(`/collections/${col.slug}/delete`, {
      form: { ids: [String(imageId)] },
    });

    await page.goto(`/collections/${col.slug}`);
    await expect(page.locator(`img[src="/image/${imageId}/thumb.jpg"]`)).not.toBeVisible();
  });

  test("unknown collection slug returns 404", async ({ request }) => {
    const res = await request.post("/collections/nonexistent-xyz-slug/delete", {
      form: { ids: ["1"] },
    });
    expect(res.status()).toBe(404);
  });

  test("empty ids is a no-op and redirects to collection", async ({ page, request }) => {
    const tag = Date.now();
    const colName = `PermDelNoop-${tag}`;
    await createCollection(page, colName);
    await uploadImage(page, "red.jpg");

    const imageId = await getLastImageId();
    const colsRes = await request.get("/api/collections");
    const col = (await colsRes.json()).find((c) => c.name === colName);
    await request.post(`/api/image/${imageId}/collections/${col.id}/toggle`);

    const res = await request.post(`/collections/${col.slug}/delete`, { form: {} });
    expect(res.url()).toMatch(new RegExp(`/collections/${col.slug}$`));

    const thumbRes = await request.get(`/image/${imageId}/thumb.jpg`);
    expect(thumbRes.status()).toBe(200);
  });
});
