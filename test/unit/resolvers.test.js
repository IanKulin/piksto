import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("stripQuery", () => {
  it("canHandle returns true for URL with query params", async () => {
    const { default: stripQuery } = await import("../../src/resolvers/stripQuery.js");
    assert.equal(stripQuery.canHandle("https://example.com/image.jpg?format=webp"), true);
  });

  it("canHandle returns false for URL without query params", async () => {
    const { default: stripQuery } = await import("../../src/resolvers/stripQuery.js");
    assert.equal(stripQuery.canHandle("https://example.com/image.jpg"), false);
  });

  it("canHandle returns false for invalid URL", async () => {
    const { default: stripQuery } = await import("../../src/resolvers/stripQuery.js");
    assert.equal(stripQuery.canHandle("not-a-url"), false);
  });

  it("resolve strips query params and returns single-element array", async () => {
    const { default: stripQuery } = await import("../../src/resolvers/stripQuery.js");
    const result = await stripQuery.resolve("https://example.com/image.jpg?format=webp&q=80");
    assert.deepEqual(result, ["https://example.com/image.jpg"]);
  });
});

describe("mastodon.canHandle", () => {
  it("returns true for a valid Mastodon post URL", async () => {
    const { default: mastodon } = await import("../../src/resolvers/mastodon.js");
    assert.equal(mastodon.canHandle("https://mastodon.social/@user/123456"), true);
  });

  it("returns false for a plain image URL", async () => {
    const { default: mastodon } = await import("../../src/resolvers/mastodon.js");
    assert.equal(mastodon.canHandle("https://example.com/photo.jpg"), false);
  });

  it("returns false for a Mastodon profile URL (no status ID)", async () => {
    const { default: mastodon } = await import("../../src/resolvers/mastodon.js");
    assert.equal(mastodon.canHandle("https://mastodon.social/@user"), false);
  });
});

describe("mastodon.resolve", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns image attachment URLs from API response", async () => {
    const { default: mastodon } = await import("../../src/resolvers/mastodon.js");

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        media_attachments: [
          { type: "image", url: "https://cdn.mastodon.social/a.jpg" },
          { type: "video", url: "https://cdn.mastodon.social/b.mp4" },
          { type: "image", url: "https://cdn.mastodon.social/c.png" },
        ],
      }),
    });

    const result = await mastodon.resolve("https://mastodon.social/@user/123456");
    assert.deepEqual(result, [
      "https://cdn.mastodon.social/a.jpg",
      "https://cdn.mastodon.social/c.png",
    ]);
  });

  it("throws when no image attachments found", async () => {
    const { default: mastodon } = await import("../../src/resolvers/mastodon.js");

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ media_attachments: [] }),
    });

    await assert.rejects(
      () => mastodon.resolve("https://mastodon.social/@user/123456"),
      /No image attachments found/
    );
  });

  it("throws when API returns non-2xx", async () => {
    const { default: mastodon } = await import("../../src/resolvers/mastodon.js");

    globalThis.fetch = async () => ({ ok: false, status: 404 });

    await assert.rejects(
      () => mastodon.resolve("https://mastodon.social/@user/123456"),
      /Mastodon API returned HTTP 404/
    );
  });
});

describe("resolveUrl", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("routes Mastodon URLs to the Mastodon resolver", async () => {
    const { resolveUrl } = await import("../../src/resolvers/index.js");

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        media_attachments: [{ type: "image", url: "https://cdn.mastodon.social/a.jpg" }],
      }),
    });

    const result = await resolveUrl("https://mastodon.social/@user/123456");
    assert.deepEqual(result, ["https://cdn.mastodon.social/a.jpg"]);
  });

  it("routes query-string URLs to the stripQuery resolver", async () => {
    const { resolveUrl } = await import("../../src/resolvers/index.js");
    const result = await resolveUrl("https://example.com/image.jpg?format=webp");
    assert.deepEqual(result, ["https://example.com/image.jpg"]);
  });

  it("passes through URLs with no matching resolver", async () => {
    const { resolveUrl } = await import("../../src/resolvers/index.js");
    const result = await resolveUrl("https://example.com/image.jpg");
    assert.deepEqual(result, ["https://example.com/image.jpg"]);
  });
});
