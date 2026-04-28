const TABLE = "sessions";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 900_000;

const schema = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    sid     TEXT NOT NULL PRIMARY KEY,
    sess    JSON NOT NULL,
    expire  TEXT NOT NULL
  )
`;

export default function createSessionStore(Store) {
  class SqliteStore extends Store {
    constructor({ client, cleanupInterval = CLEANUP_INTERVAL_MS } = {}) {
      super();
      if (!client) throw new Error("SqliteStore requires a `client` option");
      this.db = client;
      this.db.exec(schema);
      this._timer = setInterval(() => this.#clearExpired(), cleanupInterval).unref();
    }

    #clearExpired() {
      this.db.prepare(`DELETE FROM ${TABLE} WHERE datetime('now') > datetime(expire)`).run();
    }

    get(sid, cb) {
      try {
        const row = this.db
          .prepare(`SELECT sess FROM ${TABLE} WHERE sid = ? AND datetime('now') < datetime(expire)`)
          .get(sid);
        cb(null, row ? JSON.parse(row.sess) : null);
      } catch (err) {
        cb(err);
      }
    }

    set(sid, sess, cb) {
      const ageMs = sess?.cookie?.maxAge ?? SEVEN_DAYS_MS;
      const expire = new Date(Date.now() + ageMs).toISOString();
      try {
        this.db
          .prepare(`INSERT OR REPLACE INTO ${TABLE} (sid, sess, expire) VALUES (?, ?, ?)`)
          .run(sid, JSON.stringify(sess), expire);
        cb(null);
      } catch (err) {
        cb(err);
      }
    }

    destroy(sid, cb) {
      try {
        this.db.prepare(`DELETE FROM ${TABLE} WHERE sid = ?`).run(sid);
        cb(null);
      } catch (err) {
        cb(err);
      }
    }

    touch(sid, sess, cb) {
      const ageMs = sess?.cookie?.maxAge ?? SEVEN_DAYS_MS;
      const expire = sess?.cookie?.expires
        ? new Date(sess.cookie.expires).toISOString()
        : new Date(Date.now() + ageMs).toISOString();
      try {
        this.db
          .prepare(
            `UPDATE ${TABLE} SET expire = ? WHERE sid = ? AND datetime('now') < datetime(expire)`
          )
          .run(expire, sid);
        cb(null);
      } catch (err) {
        cb(err);
      }
    }

    length(cb) {
      try {
        const { count } = this.db
          .prepare(
            `SELECT COUNT(*) AS count FROM ${TABLE} WHERE datetime('now') < datetime(expire)`
          )
          .get();
        cb(null, count);
      } catch (err) {
        cb(err);
      }
    }

    clear(cb) {
      try {
        this.db.prepare(`DELETE FROM ${TABLE}`).run();
        cb(null);
      } catch (err) {
        cb(err);
      }
    }

    all(cb) {
      try {
        const rows = this.db
          .prepare(`SELECT sid, sess FROM ${TABLE} WHERE datetime('now') < datetime(expire)`)
          .all();
        cb(
          null,
          rows.map((r) => ({ ...JSON.parse(r.sess), id: r.sid }))
        );
      } catch (err) {
        cb(err);
      }
    }
  }

  return SqliteStore;
}
