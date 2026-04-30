import { encrypt } from "../crypto.js";

export function runMigrations(db) {
  migrateImages(db);
  const cols = db.prepare("PRAGMA table_info(collections)").all();
  const needsMigration = cols.some((c) => c.name === "name" && c.type === "TEXT");
  if (!needsMigration) return;

  console.warn("collections migration needed: re-encrypting name and slug columns");

  db.pragma("foreign_keys = OFF");

  db.transaction(() => {
    console.info("collections migration: creating collections_new table");
    db.prepare(
      `
      CREATE TABLE collections_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        iv_name       BLOB NOT NULL,
        name_data     BLOB NOT NULL,
        auth_tag_name BLOB NOT NULL,
        iv_slug       BLOB NOT NULL,
        slug_data     BLOB NOT NULL,
        auth_tag_slug BLOB NOT NULL,
        created_at    DATETIME DEFAULT (datetime('now'))
      )
    `
    ).run();

    const rows = db.prepare("SELECT id, name, slug, created_at FROM collections").all();
    console.info(`collections migration: encrypting ${rows.length} row(s)`);
    const insert = db.prepare(
      "INSERT INTO collections_new (id, iv_name, name_data, auth_tag_name, iv_slug, slug_data, auth_tag_slug, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    for (const row of rows) {
      const {
        iv: ivName,
        ciphertext: nameData,
        authTag: authTagName,
      } = encrypt(Buffer.from(row.name, "utf8"));
      const {
        iv: ivSlug,
        ciphertext: slugData,
        authTag: authTagSlug,
      } = encrypt(Buffer.from(row.slug, "utf8"));
      insert.run(
        row.id,
        ivName,
        nameData,
        authTagName,
        ivSlug,
        slugData,
        authTagSlug,
        row.created_at
      );
    }

    db.prepare("DROP TABLE collections").run();
    db.prepare("ALTER TABLE collections_new RENAME TO collections").run();
    console.info("collections migration: complete");
  })();

  db.pragma("foreign_keys = ON");
}

function migrateImages(db) {
  const imgCols = db.prepare("PRAGMA table_info(images)").all();
  const needsMigration = !imgCols.some((c) => c.name === "iv_url");
  if (!needsMigration) return;

  console.warn("images migration needed: adding url and comment encrypted columns");

  for (const col of [
    "iv_url",
    "url_data",
    "auth_tag_url",
    "iv_comment",
    "comment_data",
    "auth_tag_comment",
  ]) {
    db.prepare(`ALTER TABLE images ADD COLUMN ${col} BLOB`).run();
  }

  console.info("images migration: complete");
}
