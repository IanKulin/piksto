import db from "./connection.js";
import { encrypt, decrypt } from "../crypto.js";

let collectionsCache = null;

function encryptText(str) {
  const { iv, ciphertext, authTag } = encrypt(Buffer.from(str, "utf8"));
  return { iv, ciphertext, authTag };
}

function decryptText({ iv, ciphertext, authTag }) {
  return decrypt({ iv, ciphertext, authTag }).toString("utf8");
}

function loadCache() {
  const rows = db
    .prepare(
      "SELECT id, iv_name, name_data, auth_tag_name, iv_slug, slug_data, auth_tag_slug, created_at FROM collections ORDER BY created_at ASC"
    )
    .all();
  collectionsCache = rows.map((row) => ({
    id: row.id,
    name: decryptText({ iv: row.iv_name, ciphertext: row.name_data, authTag: row.auth_tag_name }),
    slug: decryptText({ iv: row.iv_slug, ciphertext: row.slug_data, authTag: row.auth_tag_slug }),
    created_at: row.created_at,
  }));
}

function ensureCache() {
  if (collectionsCache === null) loadCache();
}

function _resetCacheForTesting() {
  collectionsCache = null;
}

const stmts = {
  getImageCountsAndCovers: db.prepare(`
    SELECT c.id,
      (SELECT COUNT(*) FROM image_collections ic WHERE ic.collection_id = c.id) AS image_count,
      (SELECT ic2.image_id FROM image_collections ic2 WHERE ic2.collection_id = c.id ORDER BY ic2.image_id ASC LIMIT 1) AS cover_image_id
    FROM collections c
  `),
  createCollection: db.prepare(`
    INSERT INTO collections (iv_name, name_data, auth_tag_name, iv_slug, slug_data, auth_tag_slug)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  deleteCollectionById: db.prepare("DELETE FROM collections WHERE id = ?"),
  getImagesByCollectionId: db.prepare(`
    SELECT i.id, i.created_at FROM images i
    JOIN image_collections ic ON ic.image_id = i.id
    WHERE ic.collection_id = ?
    ORDER BY i.id ASC
  `),
  addImageToCollection: db.prepare(
    "INSERT OR IGNORE INTO image_collections (image_id, collection_id) VALUES (?, ?)"
  ),
  getCollectionIdsForImage: db.prepare(
    "SELECT collection_id FROM image_collections WHERE image_id = ?"
  ),
  toggleCheckMembership: db.prepare(
    "SELECT 1 FROM image_collections WHERE image_id = ? AND collection_id = ?"
  ),
  toggleRemoveMembership: db.prepare(
    "DELETE FROM image_collections WHERE image_id = ? AND collection_id = ?"
  ),
  toggleAddMembership: db.prepare(
    "INSERT INTO image_collections (image_id, collection_id) VALUES (?, ?)"
  ),
  prevImageInCollection: db.prepare(`
    SELECT i.id FROM images i
    JOIN image_collections ic ON ic.image_id = i.id
    WHERE ic.collection_id = ? AND i.id < ?
    ORDER BY i.id DESC
    LIMIT 1
  `),
  nextImageInCollection: db.prepare(`
    SELECT i.id FROM images i
    JOIN image_collections ic ON ic.image_id = i.id
    WHERE ic.collection_id = ? AND i.id > ?
    ORDER BY i.id ASC
    LIMIT 1
  `),
};

function getAllCollections() {
  ensureCache();
  const rows = stmts.getImageCountsAndCovers.all();
  const rowsById = Object.fromEntries(rows.map((r) => [r.id, r]));
  return collectionsCache.map((entry) => ({
    ...entry,
    image_count: rowsById[entry.id]?.image_count ?? 0,
    cover_image_id: rowsById[entry.id]?.cover_image_id ?? null,
  }));
}

function getCollectionBySlug(slug) {
  ensureCache();
  return collectionsCache.find((c) => c.slug === slug);
}

function createCollection(name, slug) {
  const { iv: ivName, ciphertext: nameData, authTag: authTagName } = encryptText(name);
  const { iv: ivSlug, ciphertext: slugData, authTag: authTagSlug } = encryptText(slug);
  const result = stmts.createCollection.run(
    ivName,
    nameData,
    authTagName,
    ivSlug,
    slugData,
    authTagSlug
  );
  loadCache();
  return result;
}

function deleteCollectionById(id) {
  const result = stmts.deleteCollectionById.run(id);
  loadCache();
  return result;
}

function deleteManyCollectionsById(ids) {
  const valid = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (valid.length === 0) return;
  const placeholders = valid.map(() => "?").join(",");
  db.prepare(`DELETE FROM collections WHERE id IN (${placeholders})`).run(...valid);
  loadCache();
}

function getImagesByCollectionSlug(slug) {
  ensureCache();
  const entry = collectionsCache.find((c) => c.slug === slug);
  if (!entry) return [];
  return stmts.getImagesByCollectionId.all(entry.id);
}

function addImagesToCollection(imageIds, collectionId) {
  const run = db.transaction((ids) => {
    for (const id of ids) stmts.addImageToCollection.run(id, collectionId);
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
  ensureCache();
  const rows = stmts.getCollectionIdsForImage.all(imageId);
  return rows
    .map((r) => collectionsCache.find((c) => c.id === r.collection_id))
    .filter(Boolean)
    .map(({ id, name, slug }) => ({ id, name, slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toggleImageInCollection(imageId, collectionId) {
  return db.transaction(() => {
    const existing = stmts.toggleCheckMembership.get(imageId, collectionId);
    if (existing) {
      stmts.toggleRemoveMembership.run(imageId, collectionId);
      return { added: false };
    }
    stmts.toggleAddMembership.run(imageId, collectionId);
    return { added: true };
  })();
}

function getAdjacentImagesInCollection(id, slug) {
  ensureCache();
  const entry = collectionsCache.find((c) => c.slug === slug);
  if (!entry) return { prevId: null, nextId: null };
  const prev = stmts.prevImageInCollection.get(entry.id, id);
  const next = stmts.nextImageInCollection.get(entry.id, id);
  return { prevId: prev?.id ?? null, nextId: next?.id ?? null };
}

export {
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
};
