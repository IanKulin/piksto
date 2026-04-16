import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use a separate in-memory DB for unit tests so we don't touch the real file
describe("database module", () => {
  let db;

  before(() => {
    // Open a fresh in-memory database with the same schema
    db = new Database(":memory:");
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
  });

  after(() => {
    db.close();
  });

  test("images table has correct columns", () => {
    const cols = db.pragma("table_info(images)").map((c) => c.name);
    const expected = [
      "id",
      "mime_type",
      "created_at",
      "iv_image",
      "image_data",
      "iv_thumb",
      "thumb_data",
      "auth_tag_image",
      "auth_tag_thumb",
    ];
    assert.deepEqual(cols, expected);
  });

  test("insert and retrieve a row", () => {
    const stmt = db.prepare(`
      INSERT INTO images (mime_type, iv_image, image_data, iv_thumb, thumb_data, auth_tag_image, auth_tag_thumb)
      VALUES (@mime_type, @iv_image, @image_data, @iv_thumb, @thumb_data, @auth_tag_image, @auth_tag_thumb)
    `);

    const row = {
      mime_type: "image/jpeg",
      iv_image: Buffer.alloc(12, 1),
      image_data: Buffer.from("fake-image"),
      iv_thumb: Buffer.alloc(12, 2),
      thumb_data: Buffer.from("fake-thumb"),
      auth_tag_image: Buffer.alloc(16, 3),
      auth_tag_thumb: Buffer.alloc(16, 4),
    };

    const info = stmt.run(row);
    assert.equal(info.changes, 1);
    assert.ok(info.lastInsertRowid > 0);

    const saved = db.prepare("SELECT * FROM images WHERE id = ?").get(info.lastInsertRowid);
    assert.equal(saved.mime_type, "image/jpeg");
    assert.deepEqual(Buffer.from(saved.iv_image), row.iv_image);
    assert.deepEqual(Buffer.from(saved.image_data), row.image_data);
    assert.deepEqual(Buffer.from(saved.auth_tag_image), row.auth_tag_image);
  });

  test("id is auto-incremented", () => {
    const count = db.prepare("SELECT COUNT(*) as n FROM images").get();
    const before = count.n;

    const stmt = db.prepare(`
      INSERT INTO images (mime_type, iv_image, image_data, iv_thumb, thumb_data, auth_tag_image, auth_tag_thumb)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const b = Buffer.alloc(1);
    stmt.run("image/png", b, b, b, b, b, b);
    stmt.run("image/png", b, b, b, b, b, b);

    const rows = db.prepare("SELECT id FROM images ORDER BY id ASC").all();
    const ids = rows.map((r) => r.id);
    // IDs should be strictly increasing
    for (let i = 1; i < ids.length; i++) {
      assert.ok(ids[i] > ids[i - 1]);
    }
    assert.equal(db.prepare("SELECT COUNT(*) as n FROM images").get().n, before + 2);
  });

  test("delete removes a row", () => {
    const stmt = db.prepare(`
      INSERT INTO images (mime_type, iv_image, image_data, iv_thumb, thumb_data, auth_tag_image, auth_tag_thumb)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const b = Buffer.alloc(1);
    const { lastInsertRowid } = stmt.run("image/gif", b, b, b, b, b, b);

    db.prepare("DELETE FROM images WHERE id = ?").run(lastInsertRowid);
    const row = db.prepare("SELECT * FROM images WHERE id = ?").get(lastInsertRowid);
    assert.equal(row, undefined);
  });

  test("db file is created on disk when module is loaded", async () => {
    await import("../../src/db.js");
    const dbPath = process.env.DB_PATH || path.join(__dirname, "../../data/photosink.db");
    assert.ok(fs.existsSync(dbPath), "db file should exist after module load");
  });
});
