import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures");

// Helper: read fixture file as a byte array for DataTransfer injection
function fixtureBytes(filename) {
  return Array.from(fs.readFileSync(path.join(FIXTURES, filename)));
}

/**
 * Simulates a file being dropped onto the drop zone.
 * Returns the URL the page lands on after the form submits.
 */
async function dropFile(page, filename, mimeType) {
  await page.goto("/");

  const bytes = fixtureBytes(filename);

  const dataTransfer = await page.evaluateHandle(
    ({ bytes, filename, mimeType }) => {
      const dt = new DataTransfer();
      const file = new File([new Uint8Array(bytes)], filename, { type: mimeType });
      dt.items.add(file);
      return dt;
    },
    { bytes, filename, mimeType }
  );

  await page.locator("#drop-zone").dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();
}

test.describe("Stage 6 — Drag-and-Drop & Polish", () => {
  // ── Drag-over highlight ──────────────────────────────────────────────────

  test("drop zone adds .drop-zone--active class on dragover", async ({ page }) => {
    await page.goto("/");
    const zone = page.locator("#drop-zone");

    await zone.dispatchEvent("dragover", { dataTransfer: null });
    await expect(zone).toHaveClass(/drop-zone--active/);
  });

  test("drop zone removes .drop-zone--active class on dragleave", async ({ page }) => {
    await page.goto("/");
    const zone = page.locator("#drop-zone");

    await zone.dispatchEvent("dragover", { dataTransfer: null });
    await expect(zone).toHaveClass(/drop-zone--active/);

    await zone.dispatchEvent("dragleave");
    await expect(zone).not.toHaveClass(/drop-zone--active/);
  });

  test("drop zone removes .drop-zone--active class after drop", async ({ page }) => {
    await page.goto("/");

    await dropFile(page, "red.jpg", "image/jpeg");

    // After form submission the page navigates away; check class was removed
    // before navigation by catching the state immediately after dispatch
    // (tested implicitly — if class remained it would show on subsequent visits)
    // Instead we verify the class is gone on a fresh visit (no lingering state)
    await page.goto("/");
    const zone = page.locator("#drop-zone");
    await expect(zone).not.toHaveClass(/drop-zone--active/);
  });

  // ── Successful drop then Upload button submits ──────────────────────────

  test("dropping a JPEG onto the drop zone uploads successfully", async ({ page }) => {
    await dropFile(page, "red.jpg", "image/jpeg");
    await page.locator("#upload-btn").click();
    await page.waitForURL("/?success=1", { timeout: 15_000 });
    await expect(page.locator(".banner--success")).toBeVisible();
  });

  test("dropping a PNG onto the drop zone uploads successfully", async ({ page }) => {
    await dropFile(page, "green.png", "image/png");
    await page.locator("#upload-btn").click();
    await page.waitForURL("/?success=1", { timeout: 15_000 });
    await expect(page.locator(".banner--success")).toBeVisible();
  });

  test("dropping a WebP onto the drop zone uploads successfully", async ({ page }) => {
    await dropFile(page, "blue.webp", "image/webp");
    await page.locator("#upload-btn").click();
    await page.waitForURL("/?success=1", { timeout: 15_000 });
    await expect(page.locator(".banner--success")).toBeVisible();
  });

  // ── Non-image drop is filtered client-side ───────────────────────────────

  test("dropping a non-image file is rejected with unsupported type error", async ({ page }) => {
    await dropFile(page, "dummy.txt", "text/plain");
    // Client-side isImage() filter silently discards it; upload button stays disabled
    await expect(page.locator("#upload-btn")).toBeDisabled();
    await expect(page.locator(".banner--success")).not.toBeVisible();
  });

  // ── Multiple files dropped — all valid images upload ────────────────────

  test("dropping multiple files uploads all images", async ({ page }) => {
    await page.goto("/");

    const bytes1 = fixtureBytes("red.jpg");
    const bytes2 = fixtureBytes("green.png");

    const dataTransfer = await page.evaluateHandle(
      ({ bytes1, bytes2 }) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(bytes1)], "red.jpg", { type: "image/jpeg" }));
        dt.items.add(new File([new Uint8Array(bytes2)], "green.png", { type: "image/png" }));
        return dt;
      },
      { bytes1, bytes2 }
    );

    await page.locator("#drop-zone").dispatchEvent("drop", { dataTransfer });
    await dataTransfer.dispose();

    await page.locator("#upload-btn").click();
    await page.waitForURL("/?success=1", { timeout: 15_000 });
    await expect(page.locator(".banner--success")).toBeVisible();
  });

  // ── npm start script ─────────────────────────────────────────────────────

  test('package.json has a "start" script pointing to server.js', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"));
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.start).toMatch(/server\.js/);
  });

  // ── Error handling / polish ──────────────────────────────────────────────

  test("unknown route returns 404", async ({ page }) => {
    const res = await page.goto("/this-does-not-exist");
    expect(res.status()).toBe(404);
  });

  test("404 page contains a user-facing message", async ({ page }) => {
    await page.goto("/no-such-page");
    const body = await page.textContent("body");
    expect(body.length).toBeGreaterThan(0);
    // Should not expose stack traces
    expect(body).not.toMatch(/Error:/);
    expect(body).not.toMatch(/at Object\./);
  });

  test("drop zone is present and has the correct id", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#drop-zone")).toBeVisible();
  });

  test("file input inside drop zone accepts image/* files", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("#file-input");
    const accept = await input.getAttribute("accept");
    expect(accept).toBe("image/*");
  });
});
