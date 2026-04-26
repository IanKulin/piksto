import { test, expect } from "@playwright/test";

test.describe("Stage 8 — Authentication", () => {
  test("unauthenticated request to / redirects to /login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("GET /login renders the login form", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.locator('form[action="/login"]')).toBeVisible();
    await ctx.close();
  });

  test("bad credentials return 400 and show an error", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.fill('input[name="username"]', "admin");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    await expect(page.locator(".banner--error")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("successful login redirects to /", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.fill('input[name="username"]', process.env.AUTH_USERNAME || "admin");
    await page.fill('input[name="password"]', "testpassword");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("http://localhost:3000/");
    await ctx.close();
  });

  test("SSRF: uploading from http://127.0.0.1 returns 400 with Invalid URL", async ({ page }) => {
    await page.goto("/");
    await page.fill('input[name="url"]', "http://127.0.0.1");
    await page.click("#fetch-btn");
    await expect(page.locator(".banner--error")).toBeVisible();
    await expect(page.locator(".banner--error")).toContainText("Invalid URL");
  });

  test("logout destroys session and redirects to /login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.fill('input[name="username"]', process.env.AUTH_USERNAME || "admin");
    await page.fill('input[name="password"]', "testpassword");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("http://localhost:3000/");
    await page.evaluate(() => document.querySelector('form[action="/logout"]').submit());
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("after logout, protected routes redirect back to /login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    // Log in fresh
    await page.goto("/login");
    await page.fill('input[name="username"]', process.env.AUTH_USERNAME || "admin");
    await page.fill('input[name="password"]', "testpassword");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("http://localhost:3000/");
    // Logout
    await page.evaluate(() => document.querySelector('form[action="/logout"]').submit());
    await expect(page).toHaveURL(/\/login/);
    // Protected route should redirect
    await page.goto("/allimages");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  // Rate limit test last — exhausts the POST /login limit for this IP
  test("rate limit (429) after too many failed attempts", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    for (let i = 0; i < 11; i++) {
      await page.goto("/login");
      await page.fill('input[name="username"]', "admin");
      await page.fill('input[name="password"]', "wrongpassword");
      await page.click('button[type="submit"]');
    }
    const content = await page.content();
    // After 10 failures the 11th should be rate limited
    expect(content.toLowerCase()).toMatch(/too many|rate limit|429/);
    await ctx.close();
  });
});
