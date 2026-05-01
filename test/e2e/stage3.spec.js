import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures");

test.describe("Stage 3 — File Upload & Encryption Pipeline", () => {
  test.describe("POST /upload/file", () => {
    test("upload a JPEG → redirects to /?success=1", async ({ page }) => {
      await page.goto("/");
      await Promise.all([
        page.waitForURL("/?success=1"),
        page
          .locator('input[type="file"][name="image"]')
          .setInputFiles(path.join(FIXTURES, "red.jpg")),
        page.locator('form[action="/upload/file"] button[type="submit"]').click(),
      ]);
      await expect(page.locator(".banner--success")).toBeVisible();
    });

    test("upload a PNG → redirects to /?success=1", async ({ page }) => {
      await page.goto("/");
      await page
        .locator('input[type="file"][name="image"]')
        .setInputFiles(path.join(FIXTURES, "green.png"));
      await page.locator('form[action="/upload/file"] button[type="submit"]').click();
      await page.waitForURL("/?success=1");
      await expect(page.locator(".banner--success")).toBeVisible();
    });

    test("upload a WebP → redirects to /?success=1", async ({ page }) => {
      await page.goto("/");
      await page
        .locator('input[type="file"][name="image"]')
        .setInputFiles(path.join(FIXTURES, "blue.webp"));
      await page.locator('form[action="/upload/file"] button[type="submit"]').click();
      await page.waitForURL("/?success=1");
      await expect(page.locator(".banner--success")).toBeVisible();
    });

    test("upload a .txt file → shows Unsupported image type error", async ({ page }) => {
      const txtFile = path.join(FIXTURES, "dummy.txt");
      fs.writeFileSync(txtFile, "not an image");
      await page.goto("/");
      await page.locator('input[type="file"][name="image"]').setInputFiles({
        name: "dummy.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not an image"),
      });
      await page.locator('form[action="/upload/file"] button[type="submit"]').click();
      await expect(page.locator(".file-list__status--error")).toBeVisible();
      await expect(page.locator(".file-list__status--error")).toContainText(
        "Unsupported image type"
      );
    });

    test("upload a file >2 MB → shows File too large error", async ({ page }) => {
      // Generate a buffer just over 2 MB
      const oversize = Buffer.alloc(2 * 1024 * 1024 + 1, 0xff);
      await page.goto("/");
      await page.locator('input[type="file"][name="image"]').setInputFiles({
        name: "big.jpg",
        mimeType: "image/jpeg",
        buffer: oversize,
      });
      await page.locator('form[action="/upload/file"] button[type="submit"]').click();
      await expect(page.locator(".file-list__status--error")).toBeVisible();
      await expect(page.locator(".file-list__status--error")).toContainText("File too large");
    });

    test("successful upload inserts a row with non-null BLOB fields", async ({ page }) => {
      await page.goto("/");
      await page
        .locator('input[type="file"][name="image"]')
        .setInputFiles(path.join(FIXTURES, "red.jpg"));
      await page.locator('form[action="/upload/file"] button[type="submit"]').click();
      await page.waitForURL("/?success=1");

      const db = new Database(process.env.DB_PATH, { readonly: true });
      const row = db.prepare("SELECT * FROM images ORDER BY id DESC LIMIT 1").get();
      db.close();

      expect(row).toBeTruthy();
      expect(row.mime_type).toBe("image/jpeg");
      expect(row.iv_image.length).toBeGreaterThan(0);
      expect(row.image_data.length).toBeGreaterThan(0);
      expect(row.auth_tag_image.length).toBeGreaterThan(0);
      expect(row.iv_thumb.length).toBeGreaterThan(0);
      expect(row.thumb_data.length).toBeGreaterThan(0);
      expect(row.auth_tag_thumb.length).toBeGreaterThan(0);
    });

    test("image and thumb are encrypted with separate IVs", async ({ page }) => {
      await page.goto("/");
      await page
        .locator('input[type="file"][name="image"]')
        .setInputFiles(path.join(FIXTURES, "red.jpg"));
      await page.locator('form[action="/upload/file"] button[type="submit"]').click();
      await page.waitForURL("/?success=1");

      const db = new Database(process.env.DB_PATH, { readonly: true });
      const row = db.prepare("SELECT * FROM images ORDER BY id DESC LIMIT 1").get();
      db.close();

      // IVs should be different (separate encrypt() calls)
      expect(Buffer.from(row.iv_image).toString("hex")).not.toBe(
        Buffer.from(row.iv_thumb).toString("hex")
      );
    });
  });

  test.describe("multi-file upload", () => {
    test("two files selected — both upload successfully", async ({ page }) => {
      await page.goto("/");
      await page
        .locator('input[type="file"][name="image"]')
        .setInputFiles([path.join(FIXTURES, "red.jpg"), path.join(FIXTURES, "green.png")]);
      await page.locator("#upload-btn").click();
      await page.waitForURL("/?success=1");
      await expect(page.locator(".banner--success")).toBeVisible();

      const db = new Database(process.env.DB_PATH, { readonly: true });
      const rows = db.prepare("SELECT id FROM images ORDER BY id DESC LIMIT 2").all();
      db.close();
      expect(rows.length).toBe(2);
    });

    test("three files — two valid, one oversized — partial failure", async ({ page }) => {
      const oversize = Buffer.alloc(2 * 1024 * 1024 + 1, 0xff);
      const redBuffer = fs.readFileSync(path.join(FIXTURES, "red.jpg"));
      const greenBuffer = fs.readFileSync(path.join(FIXTURES, "green.png"));
      await page.goto("/");
      await page.locator('input[type="file"][name="image"]').setInputFiles([
        { name: "red.jpg", mimeType: "image/jpeg", buffer: redBuffer },
        { name: "big.jpg", mimeType: "image/jpeg", buffer: oversize },
        { name: "green.png", mimeType: "image/png", buffer: greenBuffer },
      ]);
      await page.locator("#upload-btn").click();
      await expect(page.locator(".file-list__status--error")).toBeVisible();
      await expect(page.locator(".file-list__status--done")).toHaveCount(2);
      await expect(page.locator("#upload-btn")).not.toBeDisabled();
    });

    test("drop multiple files — file list populated, no auto-submit", async ({ page }) => {
      await page.goto("/");
      const bytes1 = Array.from(fs.readFileSync(path.join(FIXTURES, "red.jpg")));
      const bytes2 = Array.from(fs.readFileSync(path.join(FIXTURES, "blue.webp")));
      const dataTransfer = await page.evaluateHandle(
        ({ bytes1, bytes2 }) => {
          const dt = new DataTransfer();
          dt.items.add(new File([new Uint8Array(bytes1)], "red.jpg", { type: "image/jpeg" }));
          dt.items.add(new File([new Uint8Array(bytes2)], "blue.webp", { type: "image/webp" }));
          return dt;
        },
        { bytes1, bytes2 }
      );
      await page.locator("#drop-zone").dispatchEvent("drop", { dataTransfer });
      await dataTransfer.dispose();
      await expect(page.locator("#file-list")).toContainText("red.jpg");
      await expect(page.locator("#file-list")).toContainText("blue.webp");
      await expect(page.locator("#upload-btn")).not.toBeDisabled();
    });
  });

  test.describe("POST /upload/url", () => {
    test("malformed URL (no scheme) → shows Invalid URL error", async ({ page }) => {
      await page.goto("/");
      await page.locator('input[name="url"]').fill("not-a-url");
      // Bypass browser URL validation to exercise server-side rejection
      await page.evaluate(() => {
        const form = document.querySelector('form[action="/upload/url"]');
        form.noValidate = true;
        form.requestSubmit();
      });
      await expect(page.locator(".banner--error")).toContainText("Invalid URL");
    });

    test("empty URL → shows Invalid URL error", async ({ page }) => {
      await page.goto("/");
      await page.locator('form[action="/upload/url"] button[type="submit"]').click();
      await expect(page.locator(".banner--error")).toContainText("Invalid URL");
    });

    test("URL with ftp:// scheme → shows Invalid URL error", async ({ page }) => {
      await page.goto("/");
      await page.locator('input[name="url"]').fill("ftp://example.com/image.jpg");
      await page.locator('form[action="/upload/url"] button[type="submit"]').click();
      await expect(page.locator(".banner--error")).toContainText("Invalid URL");
    });
  });
});
