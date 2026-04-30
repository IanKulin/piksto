import { encrypt } from "../crypto.js";

export function runMigrations(db) {
  const cols = db.prepare("PRAGMA table_info(collections)").all();
  const needsMigration = cols.some((c) => c.name === "name" && c.type === "TEXT");
  if (!needsMigration) return;

  db.pragma("foreign_keys = OFF");

  db.transaction(() => {
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
  })();

  db.pragma("foreign_keys = ON");
}
