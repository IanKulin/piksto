import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

function buildDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      mime_type      TEXT    NOT NULL,
      created_at     DATETIME NOT NULL DEFAULT (datetime('now')),
      iv_image       BLOB    NOT NULL,
      image_data     BLOB    NOT NULL,
      iv_thumb       BLOB    NOT NULL,
      thumb_data     BLOB    NOT NULL,
      auth_tag_image BLOB    NOT NULL,
      auth_tag_thumb BLOB    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collections (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      slug       TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS image_collections (
      image_id      INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      added_at      DATETIME DEFAULT (datetime('now')),
      PRIMARY KEY (image_id, collection_id)
    );
  `);
  return db;
}

function insertImage(db) {
  const buf = Buffer.alloc(12);
  return db
    .prepare(
      `INSERT INTO images (mime_type, iv_image, image_data, iv_thumb, thumb_data, auth_tag_image, auth_tag_thumb)
       VALUES ('image/jpeg', ?, ?, ?, ?, ?, ?)`
    )
    .run(buf, buf, buf, buf, buf, buf).lastInsertRowid;
}

function createCollection(db, name, slug) {
  return db.prepare("INSERT INTO collections (name, slug) VALUES (?, ?)").run(name, slug);
}

function getAllCollections(db) {
  return db
    .prepare(
      `SELECT c.id, c.name, c.slug, c.created_at,
        (SELECT COUNT(*) FROM image_collections ic WHERE ic.collection_id = c.id) AS image_count,
        (SELECT ic2.image_id FROM image_collections ic2 WHERE ic2.collection_id = c.id ORDER BY ic2.image_id ASC LIMIT 1) AS cover_image_id
       FROM collections c ORDER BY c.created_at ASC`
    )
    .all();
}

function addImagesToCollection(db, imageIds, collectionId) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO image_collections (image_id, collection_id) VALUES (?, ?)"
  );
  const run = db.transaction((ids) => {
    for (const id of ids) insert.run(id, collectionId);
  });
  run(imageIds);
}

function removeImagesFromCollection(db, imageIds, collectionId) {
  if (imageIds.length === 0) return;
  const placeholders = imageIds.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM image_collections WHERE collection_id = ? AND image_id IN (${placeholders})`
  ).run(collectionId, ...imageIds);
}

function toggleImageInCollection(db, imageId, collectionId) {
  const existing = db
    .prepare("SELECT 1 FROM image_collections WHERE image_id = ? AND collection_id = ?")
    .get(imageId, collectionId);
  if (existing) {
    db.prepare("DELETE FROM image_collections WHERE image_id = ? AND collection_id = ?").run(
      imageId,
      collectionId
    );
    return { added: false };
  } else {
    db.prepare("INSERT INTO image_collections (image_id, collection_id) VALUES (?, ?)").run(
      imageId,
      collectionId
    );
    return { added: true };
  }
}

function deleteManyCollectionsById(db, ids) {
  const valid = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (valid.length === 0) return;
  const placeholders = valid.map(() => "?").join(",");
  db.prepare(`DELETE FROM collections WHERE id IN (${placeholders})`).run(...valid);
}

function getAdjacentImagesInCollection(db, id, slug) {
  const rows = db
    .prepare(
      `SELECT i.id FROM images i
       JOIN image_collections ic ON ic.image_id = i.id
       JOIN collections c ON c.id = ic.collection_id
       WHERE c.slug = ?
       ORDER BY i.id ASC`
    )
    .all(slug);
  const idx = rows.findIndex((r) => r.id === Number(id));
  if (idx === -1) return { prevId: null, nextId: null };
  return {
    prevId: idx > 0 ? rows[idx - 1].id : null,
    nextId: idx < rows.length - 1 ? rows[idx + 1].id : null,
  };
}

describe("collections db functions", () => {
  let db;

  before(() => {
    db = buildDb();
  });

  after(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec("DELETE FROM image_collections; DELETE FROM collections; DELETE FROM images;");
  });

  test("createCollection — insert and retrieve by slug", () => {
    createCollection(db, "Holidays", "holidays");
    const row = db.prepare("SELECT * FROM collections WHERE slug = ?").get("holidays");
    assert.equal(row.name, "Holidays");
    assert.equal(row.slug, "holidays");
  });

  test("getAllCollections — returns correct count and cover_image_id", () => {
    createCollection(db, "Holidays", "holidays");
    const col = db.prepare("SELECT id FROM collections WHERE slug = 'holidays'").get();
    const imgId1 = insertImage(db);
    const imgId2 = insertImage(db);
    addImagesToCollection(db, [imgId1, imgId2], col.id);
    const cols = getAllCollections(db);
    assert.equal(cols.length, 1);
    assert.equal(cols[0].image_count, 2);
    assert.equal(cols[0].cover_image_id, imgId1);
  });

  test("addImagesToCollection / removeImagesFromCollection round-trip", () => {
    createCollection(db, "Test", "test");
    const col = db.prepare("SELECT id FROM collections WHERE slug = 'test'").get();
    const imgId = insertImage(db);
    addImagesToCollection(db, [imgId], col.id);
    let rows = db.prepare("SELECT * FROM image_collections WHERE collection_id = ?").all(col.id);
    assert.equal(rows.length, 1);
    removeImagesFromCollection(db, [imgId], col.id);
    rows = db.prepare("SELECT * FROM image_collections WHERE collection_id = ?").all(col.id);
    assert.equal(rows.length, 0);
  });

  test("toggleImageInCollection — returns correct added bool on both states", () => {
    createCollection(db, "Toggle", "toggle");
    const col = db.prepare("SELECT id FROM collections WHERE slug = 'toggle'").get();
    const imgId = insertImage(db);
    const r1 = toggleImageInCollection(db, imgId, col.id);
    assert.equal(r1.added, true);
    const r2 = toggleImageInCollection(db, imgId, col.id);
    assert.equal(r2.added, false);
  });

  test("toggleImageInCollection — idempotent: toggle twice returns to original state", () => {
    createCollection(db, "Idem", "idem");
    const col = db.prepare("SELECT id FROM collections WHERE slug = 'idem'").get();
    const imgId = insertImage(db);
    toggleImageInCollection(db, imgId, col.id);
    toggleImageInCollection(db, imgId, col.id);
    const row = db
      .prepare("SELECT * FROM image_collections WHERE image_id = ? AND collection_id = ?")
      .get(imgId, col.id);
    assert.equal(row, undefined);
  });

  test("deleteManyCollectionsById — removes join rows via CASCADE", () => {
    createCollection(db, "Cascade", "cascade");
    const col = db.prepare("SELECT id FROM collections WHERE slug = 'cascade'").get();
    const imgId = insertImage(db);
    addImagesToCollection(db, [imgId], col.id);
    deleteManyCollectionsById(db, [col.id]);
    const rows = db.prepare("SELECT * FROM image_collections WHERE collection_id = ?").all(col.id);
    assert.equal(rows.length, 0);
    const c = db.prepare("SELECT * FROM collections WHERE id = ?").get(col.id);
    assert.equal(c, undefined);
  });

  test("getAdjacentImagesInCollection — returns correct prev/next for 3 images", () => {
    createCollection(db, "Adjacent", "adjacent");
    const col = db.prepare("SELECT id FROM collections WHERE slug = 'adjacent'").get();
    const id1 = insertImage(db);
    const id2 = insertImage(db);
    const id3 = insertImage(db);
    addImagesToCollection(db, [id1, id2, id3], col.id);
    const adj1 = getAdjacentImagesInCollection(db, id1, "adjacent");
    assert.equal(adj1.prevId, null);
    assert.equal(adj1.nextId, id2);
    const adj2 = getAdjacentImagesInCollection(db, id2, "adjacent");
    assert.equal(adj2.prevId, id1);
    assert.equal(adj2.nextId, id3);
    const adj3 = getAdjacentImagesInCollection(db, id3, "adjacent");
    assert.equal(adj3.prevId, id2);
    assert.equal(adj3.nextId, null);
  });
});
