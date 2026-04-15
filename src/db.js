const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { encrypt, decrypt } = require("./crypto");

const dbDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, "photosink.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

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
  )
`);

const stmts = {
  insert: db.prepare(`
    INSERT INTO images (mime_type, iv_image, image_data, iv_thumb, thumb_data, auth_tag_image, auth_tag_thumb)
    VALUES (@mime_type, @iv_image, @image_data, @iv_thumb, @thumb_data, @auth_tag_image, @auth_tag_thumb)
  `),
  getAll: db.prepare("SELECT id, created_at FROM images ORDER BY created_at ASC"),
  getById: db.prepare("SELECT * FROM images WHERE id = ?"),
  deleteById: db.prepare("DELETE FROM images WHERE id = ?"),
};

function insertImage(mime, imageBuffer, thumbBuffer) {
  const encImage = encrypt(imageBuffer);
  const encThumb = encrypt(thumbBuffer);
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

function getDecryptedImage(id) {
  const row = stmts.getById.get(id);
  if (!row) return null;
  const imageBuffer = decrypt({
    iv: row.iv_image,
    ciphertext: row.image_data,
    authTag: row.auth_tag_image,
  });
  return { id: row.id, mime_type: row.mime_type, created_at: row.created_at, imageBuffer };
}

function getDecryptedThumb(id) {
  const row = stmts.getById.get(id);
  if (!row) return null;
  const thumbBuffer = decrypt({
    iv: row.iv_thumb,
    ciphertext: row.thumb_data,
    authTag: row.auth_tag_thumb,
  });
  return { id: row.id, mime_type: row.mime_type, created_at: row.created_at, thumbBuffer };
}

module.exports = { db, stmts, insertImage, getDecryptedImage, getDecryptedThumb };
