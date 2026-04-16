import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Set up encryption key before requiring modules that depend on it
process.env.ENCRYPTION_KEY = "a".repeat(64);

// Point db at an in-memory database for isolation
process.env.DB_PATH = ":memory:";

const { saveImage, getImage, getThumb, storeUpload } = await import("../../src/imageService.js");
const { testHelpers } = await import("../../src/db.js");

describe("imageService", () => {
  test("saveImage encrypts data before storing", () => {
    const mime = "image/jpeg";
    const imageBuffer = Buffer.from("raw-image-data");
    const thumbBuffer = Buffer.from("raw-thumb-data");

    const info = saveImage(mime, imageBuffer, thumbBuffer);
    assert.ok(info.lastInsertRowid > 0);

    const row = testHelpers.getRawById(info.lastInsertRowid);
    assert.ok(
      !Buffer.from(row.image_data).equals(imageBuffer),
      "stored image_data should differ from plaintext"
    );
    assert.ok(
      !Buffer.from(row.thumb_data).equals(thumbBuffer),
      "stored thumb_data should differ from plaintext"
    );
  });

  test("getImage round-trip returns original buffer", () => {
    const mime = "image/png";
    const imageBuffer = Buffer.from("round-trip-image");
    const thumbBuffer = Buffer.from("round-trip-thumb");

    const info = saveImage(mime, imageBuffer, thumbBuffer);
    const result = getImage(info.lastInsertRowid);

    assert.ok(result !== null);
    assert.equal(result.mime_type, mime);
    assert.deepEqual(result.imageBuffer, imageBuffer);
  });

  test("getThumb round-trip returns original buffer", () => {
    const mime = "image/png";
    const imageBuffer = Buffer.from("thumb-round-trip-image");
    const thumbBuffer = Buffer.from("thumb-round-trip-thumb");

    const info = saveImage(mime, imageBuffer, thumbBuffer);
    const result = getThumb(info.lastInsertRowid);

    assert.ok(result !== null);
    assert.equal(result.mime_type, mime);
    assert.deepEqual(result.thumbBuffer, thumbBuffer);
  });

  test("getImage returns null for unknown id", () => {
    const result = getImage(999999);
    assert.equal(result, null);
  });

  test("getThumb returns null for unknown id", () => {
    const result = getThumb(999999);
    assert.equal(result, null);
  });
});

describe("storeUpload", () => {
  test("returns a result with a valid lastInsertRowid", async () => {
    const imageBuffer = Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=",
      "base64"
    );
    const result = await storeUpload(imageBuffer, "image/jpeg");
    assert.ok(result.lastInsertRowid > 0);
  });

  test("stored image can be retrieved via getImage and round-trips correctly", async () => {
    const imageBuffer = Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=",
      "base64"
    );
    const result = await storeUpload(imageBuffer, "image/jpeg");
    const retrieved = getImage(result.lastInsertRowid);
    assert.ok(retrieved !== null);
    assert.equal(retrieved.mime_type, "image/jpeg");
    assert.deepEqual(retrieved.imageBuffer, imageBuffer);
  });

  test("stored thumbnail can be retrieved via getThumb and is a valid JPEG buffer", async () => {
    const imageBuffer = Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=",
      "base64"
    );
    const result = await storeUpload(imageBuffer, "image/jpeg");
    const retrieved = getThumb(result.lastInsertRowid);
    assert.ok(retrieved !== null);
    // JPEG magic bytes: FF D8 FF
    assert.equal(retrieved.thumbBuffer[0], 0xff);
    assert.equal(retrieved.thumbBuffer[1], 0xd8);
    assert.equal(retrieved.thumbBuffer[2], 0xff);
  });
});
