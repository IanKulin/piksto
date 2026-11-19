import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.DB_PATH = ":memory:";

const db = await import("../../src/db/index.js");
const { default: conn } = await import("../../src/db/connection.js");
const svc = await import("../../src/shareService.js");

function insertImage() {
  const buf = Buffer.alloc(12);
  return Number(
    conn
      .prepare(
        `INSERT INTO images (mime_type, iv_image, image_data, iv_thumb, thumb_data, auth_tag_image, auth_tag_thumb)
         VALUES ('image/jpeg', ?, ?, ?, ?, ?, ?)`
      )
      .run(buf, buf, buf, buf, buf, buf).lastInsertRowid
  );
}

function makeCollection(name) {
  db.createCollection(name, name.toLowerCase());
  return db.getCollectionBySlug(name.toLowerCase());
}

describe("shares db", () => {
  test("create, lookup by hash, list including expired, delete scoped to collection", () => {
    const c = makeCollection("Alpha");
    const other = makeCollection("Beta");
    const future = new Date(Date.now() + 1000).toISOString();
    const past = new Date(Date.now() - 1000).toISOString();
    const id = db.createShare({
      collectionId: c.id,
      tokenHash: "h1",
      passwordHash: null,
      stripMetadata: true,
      expiresAt: future,
    });
    db.createShare({
      collectionId: c.id,
      tokenHash: "h2",
      passwordHash: "x",
      stripMetadata: false,
      expiresAt: past,
    });
    assert.equal(db.getShareByTokenHash("h1").id, id);
    assert.equal(db.getShareByTokenHash("nope"), undefined);
    const list = db.getSharesForCollection(c.id);
    assert.equal(list.length, 2);
    assert.ok(list.some((s) => s.has_password === true && s.strip_metadata === false));
    assert.equal(db.deleteShareById(id, other.id), false);
    assert.equal(db.deleteShareById(id, c.id), true);
  });

  test("shares cascade when the collection is deleted", () => {
    const c = makeCollection("Gamma");
    db.createShare({
      collectionId: c.id,
      tokenHash: "h3",
      passwordHash: null,
      stripMetadata: true,
      expiresAt: new Date().toISOString(),
    });
    db.deleteCollectionById(c.id);
    assert.equal(db.getShareByTokenHash("h3"), undefined);
  });

  test("isImageInCollection", () => {
    const c = makeCollection("Delta");
    const img = insertImage();
    assert.equal(db.isImageInCollection(img, c.id), false);
    db.addImagesToCollection([img], c.id);
    assert.equal(db.isImageInCollection(img, c.id), true);
    assert.deepEqual(
      db.getImagesByCollectionId(c.id).map((i) => i.id),
      [img]
    );
    assert.equal(db.getCollectionById(c.id).slug, "delta");
  });
});

describe("shareService", () => {
  let collection;
  before(() => {
    collection = makeCollection("Svc");
  });

  test("rejects an invalid preset", async () => {
    await assert.rejects(
      svc.createShare(collection, { expiryPreset: "never", stripMetadata: true })
    );
  });

  test("stores only the token hash and resolves the share", async () => {
    const { id, token } = await svc.createShare(collection, {
      expiryPreset: "1h",
      stripMetadata: true,
    });
    const row = conn.prepare("SELECT * FROM shares WHERE id = ?").get(id);
    assert.ok(!Object.values(row).includes(token));
    assert.equal(row.token_hash, svc.hashToken(token));
    assert.equal(svc.resolveShare(token).share.id, id);
  });

  test("unknown and expired tokens resolve to null", async () => {
    assert.equal(svc.resolveShare("unknown"), null);
    const { id, token } = await svc.createShare(collection, {
      expiryPreset: "1h",
      stripMetadata: true,
    });
    conn
      .prepare("UPDATE shares SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 1000).toISOString(), id);
    assert.equal(svc.resolveShare(token), null);
  });

  test("password verification", async () => {
    const { token } = await svc.createShare(collection, {
      password: "secret",
      expiryPreset: "1d",
      stripMetadata: true,
    });
    const { share } = svc.resolveShare(token);
    assert.equal(await svc.verifyPassword(share, "secret"), true);
    assert.equal(await svc.verifyPassword(share, "wrong"), false);
    assert.equal(await svc.verifyPassword(share, undefined), false);
  });

  test("stripImageMetadata removes EXIF and applies orientation", async () => {
    const src = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "red" },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: "me" } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    assert.ok((await sharp(src).metadata()).exif);
    const out = await svc.stripImageMetadata(src);
    const meta = await sharp(out).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal(meta.width, 20);
    assert.equal(meta.height, 40);
  });

  test("GIFs are returned unchanged", async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "blue" },
    })
      .gif()
      .toBuffer();
    assert.equal(await svc.stripImageMetadata(gif), gif);
  });
});
