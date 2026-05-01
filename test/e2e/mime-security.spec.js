import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures");

// The stage8 logout test destroys the shared session in .auth.json, so we
// create a fresh authenticated context for each test rather than relying on
// the storageState fixture.
async function freshPage(browser) {
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/login");
  await page.fill('input[name="username"]', process.env.AUTH_USERNAME || "admin");
  await page.fill('input[name="password"]', "testpassword");
  await page.click('button[type="submit"]');
  await page.waitForURL("http://localhost:3000/");
  return { ctx, page };
}

test.describe("MIME type magic byte validation", () => {
  test("uploading a text file with Content-Type image/jpeg is rejected with 400", async ({
    browser,
  }) => {
    const { ctx, page } = await freshPage(browser);

    await page.goto("/");
    await page.locator('input[type="file"][name="image"]').setInputFiles({
      name: "fake.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0x74, 0x68, 0x69, 0x73, 0x20, 0x69, 0x73, 0x20, 0x6e, 0x6f, 0x74]),
    });
    await page.locator('form[action="/upload/file"] button[type="submit"]').click();

    await expect(page.locator(".file-list__status--error")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".file-list__status--error")).toContainText("Unsupported image type");
    await expect(page).not.toHaveURL(/success=1/);
    await ctx.close();
  });

  test("uploading a real JPEG succeeds", async ({ browser }) => {
    const { ctx, page } = await freshPage(browser);

    await page.goto("/");
    await page
      .locator('input[type="file"][name="image"]')
      .setInputFiles(path.join(FIXTURES, "red.jpg"));
    await page.locator('form[action="/upload/file"] button[type="submit"]').click();
    await page.waitForURL("/?success=1", { timeout: 15_000 });
    await ctx.close();
  });
});
