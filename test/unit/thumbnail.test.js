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

  test("output is a 400x400 square", async () => {
    const input = fs.readFileSync(path.join(__dirname, "../fixtures/red.jpg"));
    const result = await generateThumbnail(input);
    const meta = await sharp(result).metadata();
    assert.equal(meta.width, 400);
    assert.equal(meta.height, 400);
  });

  test("very wide and very tall images are cropped to fill the square", async () => {
    for (const [width, height] of [
      [3000, 100],
      [100, 3000],
    ]) {
      const input = await sharp({
        create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
      })
        .jpeg()
        .toBuffer();
      const meta = await sharp(await generateThumbnail(input)).metadata();
      assert.equal(meta.width, 400, `${width}x${height} width`);
      assert.equal(meta.height, 400, `${width}x${height} height`);
    }
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
    assert.equal(meta.width, 400);
    assert.equal(meta.height, 400);
  });

  test("works with PNG input", async () => {
    const input = fs.readFileSync(path.join(__dirname, "../fixtures/green.png"));
    const result = await generateThumbnail(input);
    const meta = await sharp(result).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, 400);
  });

  test("applies EXIF orientation", async () => {
    // Stored as 200x100 landscape: left half red, right half blue. Orientation 6
    // (rotate 90° CW) displays it as portrait with red on top and blue on the bottom.
    const left = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const input = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .composite([{ input: left, left: 0, top: 0 }])
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 100 })
      .toBuffer();

    const result = await generateThumbnail(input);
    const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x, y) => {
      const i = (y * info.width + x) * info.channels;
      return { r: data[i], b: data[i + 2] };
    };
    const top = pixel(info.width / 2, 20);
    const bottom = pixel(info.width / 2, info.height - 20);
    assert.ok(top.r > 200 && top.b < 80, `expected red at top, got ${JSON.stringify(top)}`);
    assert.ok(
      bottom.b > 200 && bottom.r < 80,
      `expected blue at bottom, got ${JSON.stringify(bottom)}`
    );
  });

  test("rejects invalid input buffer", async () => {
    await assert.rejects(() => generateThumbnail(Buffer.from("not an image")));
  });
});
