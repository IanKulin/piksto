import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { generateThumbnail } from "../../src/thumbnail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("thumbnail generation", () => {
  test("returns a Buffer", async () => {
    const input = fs.readFileSync(path.join(__dirname, "../fixtures/red.jpg"));
    const result = await generateThumbnail(input);
    assert.ok(Buffer.isBuffer(result));
  });

  test("output is a valid JPEG", async () => {
    const input = fs.readFileSync(path.join(__dirname, "../fixtures/red.jpg"));
    const result = await generateThumbnail(input);
    const meta = await sharp(result).metadata();
    assert.equal(meta.format, "jpeg");
  });

  test("output dimensions are at most 300x300", async () => {
    const input = fs.readFileSync(path.join(__dirname, "../fixtures/red.jpg"));
    const result = await generateThumbnail(input);
    const meta = await sharp(result).metadata();
    assert.ok(meta.width <= 300, `width ${meta.width} should be <= 300`);
    assert.ok(meta.height <= 300, `height ${meta.height} should be <= 300`);
  });

  test("thumbnail is smaller than a large source image", async () => {
    // Create a large 1000x1000 image in memory
    const largeBuffer = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const thumb = await generateThumbnail(largeBuffer);
    const meta = await sharp(thumb).metadata();
    assert.ok(meta.width <= 300);
    assert.ok(meta.height <= 300);
  });

  test("works with PNG input", async () => {
    const input = fs.readFileSync(path.join(__dirname, "../fixtures/green.png"));
    const result = await generateThumbnail(input);
    const meta = await sharp(result).metadata();
    assert.equal(meta.format, "jpeg");
    assert.ok(meta.width <= 300);
  });

  test("rejects invalid input buffer", async () => {
    await assert.rejects(() => generateThumbnail(Buffer.from("not an image")));
  });
});
