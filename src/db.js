const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

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

function closeDb() {
  db.close();
}

module.exports = {
  insertRaw,
  deleteManyById,
  getAllImages,
  getById,
  deleteById,
  testHelpers,
  closeDb,
};
