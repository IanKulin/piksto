import { test, expect } from "@playwright/test";

test.describe("Stage 2 — Upload Page (UI Shell)", () => {
  test("GET / renders the upload page", async ({ page }) => {
    const res = await page.goto("/");
    expect(res.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("drag-and-drop zone is visible with dashed border", async ({ page }) => {
    await page.goto("/");
    const dropZone = page.locator("#drop-zone");
    await expect(dropZone).toBeVisible();

    const borderStyle = await dropZone.evaluate((el) => getComputedStyle(el).borderStyle);
    expect(borderStyle).toBe("dashed");
  });

  test("?success=1 shows green success banner", async ({ page }) => {
    await page.goto("/?success=1");
    const banner = page.locator(".banner--success");
    await expect(banner).toBeVisible();
  });

  test("nav link to /allimages is present in the header", async ({ page }) => {
    await page.goto("/");
    const allImagesLink = page.locator('header a[href="/allimages"]');
    await expect(allImagesLink).toBeVisible();
  });

  test("file input accepts only images", async ({ page }) => {
    await page.goto("/");
    const fileInput = page.locator('input[type="file"][name="image"]');
    await expect(fileInput).toHaveAttribute("accept", "image/*");
  });

  test("upload file form POSTs to /upload/file", async ({ page }) => {
    await page.goto("/");
    const form = page.locator('form[action="/upload/file"]');
    await expect(form).toHaveAttribute("method", "POST");
    await expect(form).toHaveAttribute("enctype", "multipart/form-data");
  });

  test("URL form POSTs to /upload/url", async ({ page }) => {
    await page.goto("/");
    const form = page.locator('form[action="/upload/url"]');
    await expect(form).toHaveAttribute("method", "POST");
    const urlInput = form.locator('input[name="url"]');
    await expect(urlInput).toBeVisible();
  });

  test("page is usable on a narrow (mobile) viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator("#drop-zone")).toBeVisible();
    await expect(page.locator('input[name="url"]')).toBeVisible();
  });

  test("no banner shown when no query params", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".banner--success")).not.toBeVisible();
    await expect(page.locator(".banner--error")).not.toBeVisible();
  });
});
