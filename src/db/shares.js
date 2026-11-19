import db from "./connection.js";

const stmts = {
  createShare: db.prepare(`
    INSERT INTO shares (collection_id, token_hash, password_hash, strip_metadata, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  getShareByTokenHash: db.prepare("SELECT * FROM shares WHERE token_hash = ?"),
  getSharesForCollection: db.prepare(`
    SELECT id, password_hash IS NOT NULL AS has_password, strip_metadata, expires_at, created_at
    FROM shares WHERE collection_id = ? ORDER BY id DESC
  `),
  deleteShareById: db.prepare("DELETE FROM shares WHERE id = ? AND collection_id = ?"),
  isImageInCollection: db.prepare(
    "SELECT 1 FROM image_collections WHERE image_id = ? AND collection_id = ?"
  ),
};

function createShare({ collectionId, tokenHash, passwordHash, stripMetadata, expiresAt }) {
  const result = stmts.createShare.run(
    collectionId,
    tokenHash,
    passwordHash ?? null,
    stripMetadata ? 1 : 0,
    expiresAt
  );
  return Number(result.lastInsertRowid);
}

function getShareByTokenHash(hash) {
  return stmts.getShareByTokenHash.get(hash);
}

function getSharesForCollection(collectionId) {
  return stmts.getSharesForCollection.all(collectionId).map((row) => ({
    ...row,
    has_password: Boolean(row.has_password),
    strip_metadata: Boolean(row.strip_metadata),
  }));
}

function deleteShareById(id, collectionId) {
  return stmts.deleteShareById.run(id, collectionId).changes > 0;
}

function isImageInCollection(imageId, collectionId) {
  return stmts.isImageInCollection.get(imageId, collectionId) !== undefined;
}

export {
  createShare,
  getShareByTokenHash,
  getSharesForCollection,
  deleteShareById,
  isImageInCollection,
};
