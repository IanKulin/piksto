import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { runMigrations } from "./migrate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbDir = path.join(__dirname, "..", "..", "data");
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
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    iv_name       BLOB NOT NULL,
    name_data     BLOB NOT NULL,
    auth_tag_name BLOB NOT NULL,
    iv_slug       BLOB NOT NULL,
    slug_data     BLOB NOT NULL,
    auth_tag_slug BLOB NOT NULL,
    created_at    DATETIME DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS image_collections (
    image_id      INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    added_at      DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (image_id, collection_id)
  );

  CREATE INDEX IF NOT EXISTS idx_image_collections_collection_id
    ON image_collections(collection_id);
`);

runMigrations(db);

export default db;
