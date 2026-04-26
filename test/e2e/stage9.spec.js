import { test, expect } from "@playwright/test";

test.describe("Stage 9 — Route Rename & Navigation", () => {
  test("/gallery redirects to /allimages", async ({ page }) => {
    const res = await page.goto("/gallery");
    await expect(page).toHaveURL(/\/allimages/);
    expect(res.status()).toBe(200);
  });

  test("nav contains All Images link", async ({ page }) => {
    await page.goto("/allimages");
    await expect(page.locator('.site-nav a[href="/allimages"]')).toBeVisible();
  });

  test("nav contains Collections link", async ({ page }) => {
    await page.goto("/allimages");
    await expect(page.locator('.site-nav a[href="/collections"]')).toBeVisible();
  });

  test("All Images nav link is active on /allimages", async ({ page }) => {
    await page.goto("/allimages");
    await expect(page.locator('a[href="/allimages"].nav-link--active')).toBeVisible();
  });

  test("/allimages renders image grid or empty state", async ({ page }) => {
    await page.goto("/allimages");
    const hasGrid = await page.locator(".gallery-grid").isVisible();
    const hasEmpty = await page.locator(".gallery-empty").isVisible();
    expect(hasGrid || hasEmpty).toBe(true);
  });
});
