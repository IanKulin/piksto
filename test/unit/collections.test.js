import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.DB_PATH = ":memory:";

const {
  getAllCollections,
  getCollectionBySlug,
  createCollection,
  deleteCollectionById,
  deleteManyCollectionsById,
  getImagesByCollectionSlug,
  addImagesToCollection,
  removeImagesFromCollection,
  getCollectionsForImage,
  toggleImageInCollection,
  getAdjacentImagesInCollection,
  _resetCacheForTesting,
} = await import("../../src/db/collections.js");

const { default: db } = await import("../../src/db/connection.js");

function insertImage() {
  const buf = Buffer.alloc(12);
  return db
    .prepare(
      `INSERT INTO images (mime_type, iv_image, image_data, iv_thumb, thumb_data, auth_tag_image, auth_tag_thumb)
       VALUES ('image/jpeg', ?, ?, ?, ?, ?, ?)`
    )
    .run(buf, buf, buf, buf, buf, buf).lastInsertRowid;
}

describe("collections db functions", () => {
  before(() => {
    db.exec("DELETE FROM image_collections; DELETE FROM collections; DELETE FROM images;");
    _resetCacheForTesting();
  });

  beforeEach(() => {
    db.exec("DELETE FROM image_collections; DELETE FROM collections; DELETE FROM images;");
    _resetCacheForTesting();
  });

  test("createCollection — name and slug round-trip through encrypt/decrypt", () => {
    createCollection("Holidays", "holidays");
    const col = getCollectionBySlug("holidays");
    assert.equal(col.name, "Holidays");
    assert.equal(col.slug, "holidays");
  });

  test("getCollectionBySlug — returns undefined for missing slug", () => {
    assert.equal(getCollectionBySlug("nope"), undefined);
  });

  test("getAllCollections — returns correct count and cover_image_id", () => {
    createCollection("Holidays", "holidays");
    const col = getCollectionBySlug("holidays");
    const imgId1 = insertImage();
    const imgId2 = insertImage();
    addImagesToCollection([imgId1, imgId2], col.id);
    const cols = getAllCollections();
    assert.equal(cols.length, 1);
    assert.equal(cols[0].image_count, 2);
    assert.equal(cols[0].cover_image_id, imgId1);
    assert.equal(cols[0].name, "Holidays");
    assert.equal(cols[0].slug, "holidays");
  });

  test("duplicate slug detection via cache", () => {
    createCollection("First", "same-slug");
    createCollection("Second", "same-slug");
    const cols = getAllCollections();
    const matching = cols.filter((c) => c.slug === "same-slug");
    assert.equal(matching.length, 2);
  });

  test("addImagesToCollection / removeImagesFromCollection round-trip", () => {
    createCollection("Test", "test");
    const col = getCollectionBySlug("test");
    const imgId = insertImage();
    addImagesToCollection([imgId], col.id);
    let rows = db.prepare("SELECT * FROM image_collections WHERE collection_id = ?").all(col.id);
    assert.equal(rows.length, 1);
    removeImagesFromCollection([imgId], col.id);
    rows = db.prepare("SELECT * FROM image_collections WHERE collection_id = ?").all(col.id);
    assert.equal(rows.length, 0);
  });

  test("toggleImageInCollection — returns correct added bool on both states", () => {
    createCollection("Toggle", "toggle");
    const col = getCollectionBySlug("toggle");
    const imgId = insertImage();
    const r1 = toggleImageInCollection(imgId, col.id);
    assert.equal(r1.added, true);
    const r2 = toggleImageInCollection(imgId, col.id);
    assert.equal(r2.added, false);
  });

  test("toggleImageInCollection — idempotent: toggle twice returns to original state", () => {
    createCollection("Idem", "idem");
    const col = getCollectionBySlug("idem");
    const imgId = insertImage();
    toggleImageInCollection(imgId, col.id);
    toggleImageInCollection(imgId, col.id);
    const row = db
      .prepare("SELECT * FROM image_collections WHERE image_id = ? AND collection_id = ?")
      .get(imgId, col.id);
    assert.equal(row, undefined);
  });

  test("deleteCollectionById — removes collection and cache is updated", () => {
    createCollection("ToDelete", "to-delete");
    const col = getCollectionBySlug("to-delete");
    deleteCollectionById(col.id);
    assert.equal(getCollectionBySlug("to-delete"), undefined);
  });

  test("deleteManyCollectionsById — removes join rows via CASCADE and invalidates cache", () => {
    createCollection("Cascade", "cascade");
    const col = getCollectionBySlug("cascade");
    const imgId = insertImage();
    addImagesToCollection([imgId], col.id);
    deleteManyCollectionsById([col.id]);
    const rows = db.prepare("SELECT * FROM image_collections WHERE collection_id = ?").all(col.id);
    assert.equal(rows.length, 0);
    assert.equal(getCollectionBySlug("cascade"), undefined);
  });

  test("getImagesByCollectionSlug — returns images for collection", () => {
    createCollection("MyCol", "mycol");
    const col = getCollectionBySlug("mycol");
    const imgId1 = insertImage();
    const imgId2 = insertImage();
    addImagesToCollection([imgId1, imgId2], col.id);
    const images = getImagesByCollectionSlug("mycol");
    assert.equal(images.length, 2);
  });

  test("getImagesByCollectionSlug — returns empty array for unknown slug", () => {
    const images = getImagesByCollectionSlug("unknown");
    assert.deepEqual(images, []);
  });

  test("getCollectionsForImage — returns collections sorted by name", () => {
    createCollection("Zeta", "zeta");
    createCollection("Alpha", "alpha");
    const zeta = getCollectionBySlug("zeta");
    const alpha = getCollectionBySlug("alpha");
    const imgId = insertImage();
    addImagesToCollection([imgId], zeta.id);
    addImagesToCollection([imgId], alpha.id);
    const cols = getCollectionsForImage(imgId);
    assert.equal(cols.length, 2);
    assert.equal(cols[0].name, "Alpha");
    assert.equal(cols[1].name, "Zeta");
  });

  test("getAdjacentImagesInCollection — returns correct prev/next for 3 images", () => {
    createCollection("Adjacent", "adjacent");
    const col = getCollectionBySlug("adjacent");
    const id1 = insertImage();
    const id2 = insertImage();
    const id3 = insertImage();
    addImagesToCollection([id1, id2, id3], col.id);
    const adj1 = getAdjacentImagesInCollection(id1, "adjacent");
    assert.equal(adj1.prevId, null);
    assert.equal(adj1.nextId, id2);
    const adj2 = getAdjacentImagesInCollection(id2, "adjacent");
    assert.equal(adj2.prevId, id1);
    assert.equal(adj2.nextId, id3);
    const adj3 = getAdjacentImagesInCollection(id3, "adjacent");
    assert.equal(adj3.prevId, id2);
    assert.equal(adj3.nextId, null);
  });
});
