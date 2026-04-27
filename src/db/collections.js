import db from "./connection.js";

const stmts = {
  getAllCollections: db.prepare(`
    SELECT c.id, c.name, c.slug, c.created_at,
      (SELECT COUNT(*) FROM image_collections ic WHERE ic.collection_id = c.id) AS image_count,
      (SELECT ic2.image_id FROM image_collections ic2 WHERE ic2.collection_id = c.id ORDER BY ic2.image_id ASC LIMIT 1) AS cover_image_id
    FROM collections c
    ORDER BY c.created_at ASC
  `),
  getCollectionBySlug: db.prepare("SELECT * FROM collections WHERE slug = ?"),
  createCollection: db.prepare("INSERT INTO collections (name, slug) VALUES (?, ?)"),
  deleteCollectionById: db.prepare("DELETE FROM collections WHERE id = ?"),
  getImagesByCollectionSlug: db.prepare(`
    SELECT i.id, i.created_at FROM images i
    JOIN image_collections ic ON ic.image_id = i.id
    JOIN collections c ON c.id = ic.collection_id
    WHERE c.slug = ?
    ORDER BY i.id ASC
  `),
  addImageToCollection: db.prepare(
    "INSERT OR IGNORE INTO image_collections (image_id, collection_id) VALUES (?, ?)"
  ),
  getCollectionsForImage: db.prepare(`
    SELECT c.id, c.name, c.slug FROM collections c
    JOIN image_collections ic ON ic.collection_id = c.id
    WHERE ic.image_id = ?
  `),
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
    JOIN collections c ON c.id = ic.collection_id
    WHERE c.slug = ? AND i.id < ?
    ORDER BY i.id DESC
    LIMIT 1
  `),
  nextImageInCollection: db.prepare(`
    SELECT i.id FROM images i
    JOIN image_collections ic ON ic.image_id = i.id
    JOIN collections c ON c.id = ic.collection_id
    WHERE c.slug = ? AND i.id > ?
    ORDER BY i.id ASC
    LIMIT 1
  `),
};

function getAllCollections() {
  return stmts.getAllCollections.all();
}

function getCollectionBySlug(slug) {
  return stmts.getCollectionBySlug.get(slug);
}

function createCollection(name, slug) {
  return stmts.createCollection.run(name, slug);
}

function deleteCollectionById(id) {
  return stmts.deleteCollectionById.run(id);
}

function deleteManyCollectionsById(ids) {
  const valid = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (valid.length === 0) return;
  const placeholders = valid.map(() => "?").join(",");
  db.prepare(`DELETE FROM collections WHERE id IN (${placeholders})`).run(...valid);
}

function getImagesByCollectionSlug(slug) {
  return stmts.getImagesByCollectionSlug.all(slug);
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
  return stmts.getCollectionsForImage.all(imageId);
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
  const prev = stmts.prevImageInCollection.get(slug, id);
  const next = stmts.nextImageInCollection.get(slug, id);
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
};
