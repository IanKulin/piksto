import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, "piksto.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
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

const stmts = {
  insert: db.prepare(`
    INSERT INTO images (mime_type, iv_image, image_data, iv_thumb, thumb_data, auth_tag_image, auth_tag_thumb)
    VALUES (@mime_type, @iv_image, @image_data, @iv_thumb, @thumb_data, @auth_tag_image, @auth_tag_thumb)
  `),
  getAll: db.prepare("SELECT id, created_at FROM images ORDER BY created_at ASC"),
  getById: db.prepare("SELECT * FROM images WHERE id = ?"),
  deleteById: db.prepare("DELETE FROM images WHERE id = ?"),
  prevImage: db.prepare(`
    SELECT id FROM images
    WHERE created_at < (SELECT created_at FROM images WHERE id = ?)
       OR (created_at = (SELECT created_at FROM images WHERE id = ?) AND id < ?)
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `),
  nextImage: db.prepare(`
    SELECT id FROM images
    WHERE created_at > (SELECT created_at FROM images WHERE id = ?)
       OR (created_at = (SELECT created_at FROM images WHERE id = ?) AND id > ?)
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `),
};

function insertRaw(mime, encImage, encThumb) {
  return stmts.insert.run({
    mime_type: mime,
    iv_image: encImage.iv,
    image_data: encImage.ciphertext,
    auth_tag_image: encImage.authTag,
    iv_thumb: encThumb.iv,
    thumb_data: encThumb.ciphertext,
    auth_tag_thumb: encThumb.authTag,
  });
}

function deleteManyById(ids) {
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM images WHERE id IN (${placeholders})`).run(...ids);
}

function getAllImages() {
  return stmts.getAll.all();
}

function getById(id) {
  return stmts.getById.get(id);
}

function deleteById(id) {
  return stmts.deleteById.run(id);
}

const testHelpers = {
  getRawById: (id) => stmts.getById.get(id),
};

function getAllCollections() {
  return db
    .prepare(
      `SELECT c.id, c.name, c.slug, c.created_at,
        (SELECT COUNT(*) FROM image_collections ic WHERE ic.collection_id = c.id) AS image_count,
        (SELECT ic2.image_id FROM image_collections ic2 WHERE ic2.collection_id = c.id ORDER BY ic2.image_id ASC LIMIT 1) AS cover_image_id
       FROM collections c
       ORDER BY c.created_at ASC`
    )
    .all();
}

function getCollectionBySlug(slug) {
  return db.prepare("SELECT * FROM collections WHERE slug = ?").get(slug);
}

function createCollection(name, slug) {
  return db.prepare("INSERT INTO collections (name, slug) VALUES (?, ?)").run(name, slug);
}

function deleteCollectionById(id) {
  return db.prepare("DELETE FROM collections WHERE id = ?").run(id);
}

function deleteManyCollectionsById(ids) {
  const valid = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (valid.length === 0) return;
  const placeholders = valid.map(() => "?").join(",");
  db.prepare(`DELETE FROM collections WHERE id IN (${placeholders})`).run(...valid);
}

function getImagesByCollectionSlug(slug) {
  return db
    .prepare(
      `SELECT i.id, i.created_at FROM images i
       JOIN image_collections ic ON ic.image_id = i.id
       JOIN collections c ON c.id = ic.collection_id
       WHERE c.slug = ?
       ORDER BY i.id ASC`
    )
    .all(slug);
}

function addImagesToCollection(imageIds, collectionId) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO image_collections (image_id, collection_id) VALUES (?, ?)"
  );
  const run = db.transaction((ids) => {
    for (const id of ids) insert.run(id, collectionId);
  });
  run(imageIds);
}

function removeImagesFromCollection(imageIds, collectionId) {
  if (imageIds.length === 0) return;
  const placeholders = imageIds.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM image_collections WHERE collection_id = ? AND image_id IN (${placeholders})`
  ).run(collectionId, ...imageIds);
}

function getCollectionsForImage(imageId) {
  return db
    .prepare(
      `SELECT c.id, c.name, c.slug FROM collections c
       JOIN image_collections ic ON ic.collection_id = c.id
       WHERE ic.image_id = ?`
    )
    .all(imageId);
}

function toggleImageInCollection(imageId, collectionId) {
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

function getAdjacentImagesInCollection(id, slug) {
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

function getAdjacentImages(id) {
  const prev = stmts.prevImage.get(id, id, id);
  const next = stmts.nextImage.get(id, id, id);
  return { prevId: prev?.id ?? null, nextId: next?.id ?? null };
}

function ping() {
  db.prepare("SELECT 1").get();
}

function closeDb() {
  db.close();
}

export {
  insertRaw,
  deleteManyById,
  getAllImages,
  getById,
  deleteById,
  getAdjacentImages,
  testHelpers,
  closeDb,
  ping,
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
};
