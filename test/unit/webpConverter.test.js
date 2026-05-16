import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

async function makeWebpBuffer() {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .webp()
    .toBuffer();
}

async function makeJpegBuffer() {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 255, b: 0 } },
  })
    .jpeg()
    .toBuffer();
}

describe("maybeConvertWebp — default (CONVERT=true)", () => {
  it("converts WebP buffer to JPEG and returns image/jpeg", async () => {
    const { maybeConvertWebp } = await import(`../../src/webpConverter.js?t=${Date.now()}`);
    const webp = await makeWebpBuffer();
    const { buffer, mimeType } = await maybeConvertWebp(webp, "image/webp");
    assert.equal(mimeType, "image/jpeg");
    const detected = await fileTypeFromBuffer(buffer);
    assert.equal(detected?.mime, "image/jpeg");
  });

  it("passes through non-WebP buffers unchanged", async () => {
    const { maybeConvertWebp } = await import(`../../src/webpConverter.js?t=${Date.now() + 1}`);
    const jpeg = await makeJpegBuffer();
    const { buffer, mimeType } = await maybeConvertWebp(jpeg, "image/jpeg");
    assert.equal(mimeType, "image/jpeg");
    assert.equal(buffer, jpeg);
  });
});

describe("maybeConvertWebp — opt-out (CONVERT=false)", () => {
  it("passes WebP through unchanged when env var is false", async () => {
    process.env.CONVERT_WEBP_TO_JPEG = "false";
    try {
      const { maybeConvertWebp } = await import(`../../src/webpConverter.js?t=${Date.now() + 2}`);
      const webp = await makeWebpBuffer();
      const { buffer, mimeType } = await maybeConvertWebp(webp, "image/webp");
      assert.equal(mimeType, "image/webp");
      assert.equal(buffer, webp);
    } finally {
      delete process.env.CONVERT_WEBP_TO_JPEG;
    }
  });
});

describe("maybeConvertWebp — MIME integrity", () => {
  it("returned MIME matches actual buffer type after conversion", async () => {
    const { maybeConvertWebp } = await import(`../../src/webpConverter.js?t=${Date.now() + 3}`);
    const webp = await makeWebpBuffer();
    const { buffer, mimeType } = await maybeConvertWebp(webp, "image/webp");
    const detected = await fileTypeFromBuffer(buffer);
    assert.equal(detected?.mime, mimeType);
  });
});
