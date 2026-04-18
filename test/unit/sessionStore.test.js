import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { EventEmitter } from "node:events";
import createSessionStore from "../../src/sessionStore.js";

// Minimal Store base class — mirrors what express-session provides
class Store extends EventEmitter {}
const SqliteStore = createSessionStore(Store);

function makeStore(opts = {}) {
  const db = new Database(":memory:");
  const store = new SqliteStore({ client: db, cleanupInterval: 999_999_999, ...opts });
  return { store, db };
}

function get(store, sid) {
  return new Promise((resolve, reject) =>
    store.get(sid, (err, sess) => (err ? reject(err) : resolve(sess)))
  );
}

function set(store, sid, sess) {
  return new Promise((resolve, reject) =>
    store.set(sid, sess, (err) => (err ? reject(err) : resolve()))
  );
}

function destroy(store, sid) {
  return new Promise((resolve, reject) =>
    store.destroy(sid, (err) => (err ? reject(err) : resolve()))
  );
}

function touch(store, sid, sess) {
  return new Promise((resolve, reject) =>
    store.touch(sid, sess, (err) => (err ? reject(err) : resolve()))
  );
}

function length(store) {
  return new Promise((resolve, reject) =>
    store.length((err, n) => (err ? reject(err) : resolve(n)))
  );
}

function clear(store) {
  return new Promise((resolve, reject) =>
    store.clear((err) => (err ? reject(err) : resolve()))
  );
}

function all(store) {
  return new Promise((resolve, reject) =>
    store.all((err, rows) => (err ? reject(err) : resolve(rows)))
  );
}

// Helper: write a session row with a custom expire time directly via SQL
function insertExpired(db, sid) {
  db.prepare(
    `INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, datetime('now', '-1 second'))`
  ).run(sid, JSON.stringify({ user: "ghost" }));
}

describe("SqliteStore", () => {
  let store;
  let db;

  beforeEach(() => {
    ({ store, db } = makeStore());
  });

  afterEach(() => {
    db.close();
  });

  test("throws without a client", () => {
    assert.throws(() => new SqliteStore(), /client/);
  });

  test("set then get round-trips session data", async () => {
    await set(store, "abc", { user: "ian", cookie: { maxAge: 60_000 } });
    const sess = await get(store, "abc");
    assert.equal(sess.user, "ian");
  });

  test("get returns null for unknown sid", async () => {
    const sess = await get(store, "no-such-sid");
    assert.equal(sess, null);
  });

  test("destroy removes a session", async () => {
    await set(store, "abc", { user: "ian", cookie: { maxAge: 60_000 } });
    await destroy(store, "abc");
    assert.equal(await get(store, "abc"), null);
  });

  test("destroy is a no-op for unknown sid", async () => {
    await assert.doesNotReject(() => destroy(store, "no-such-sid"));
  });

  test("set overwrites an existing session", async () => {
    await set(store, "abc", { user: "ian", cookie: { maxAge: 60_000 } });
    await set(store, "abc", { user: "updated", cookie: { maxAge: 60_000 } });
    const sess = await get(store, "abc");
    assert.equal(sess.user, "updated");
  });

  test("length returns the number of sessions", async () => {
    assert.equal(await length(store), 0);
    await set(store, "s1", { cookie: { maxAge: 60_000 } });
    await set(store, "s2", { cookie: { maxAge: 60_000 } });
    assert.equal(await length(store), 2);
  });

  test("clear removes all sessions", async () => {
    await set(store, "s1", { cookie: { maxAge: 60_000 } });
    await set(store, "s2", { cookie: { maxAge: 60_000 } });
    await clear(store);
    assert.equal(await length(store), 0);
  });

  test("all returns every session with id set", async () => {
    await set(store, "s1", { user: "a", cookie: { maxAge: 60_000 } });
    await set(store, "s2", { user: "b", cookie: { maxAge: 60_000 } });
    const rows = await all(store);
    assert.equal(rows.length, 2);
    const sids = rows.map((r) => r.id).sort();
    assert.deepEqual(sids, ["s1", "s2"]);
  });

  test("expired sessions are not returned by get", async () => {
    insertExpired(db, "stale");
    assert.equal(await get(store, "stale"), null);
  });

  test("expired sessions are not counted by length", async () => {
    insertExpired(db, "stale");
    assert.equal(await length(store), 0);
  });

  test("touch extends expiry on a live session", async () => {
    await set(store, "abc", { user: "ian", cookie: { maxAge: 60_000 } });

    const before = db
      .prepare("SELECT expire FROM sessions WHERE sid = ?")
      .get("abc").expire;

    // touch with a longer maxAge
    await touch(store, "abc", { cookie: { maxAge: 3_600_000 } });

    const after = db
      .prepare("SELECT expire FROM sessions WHERE sid = ?")
      .get("abc").expire;

    assert.ok(new Date(after) > new Date(before), "expire should be extended");
  });

  test("touch is a no-op for an already-expired session", async () => {
    insertExpired(db, "stale");
    await touch(store, "stale", { cookie: { maxAge: 60_000 } });
    // Row exists but should still be expired (touch WHERE guards on non-expired)
    assert.equal(await get(store, "stale"), null);
  });

  test("set uses maxAge to compute expiry", async () => {
    await set(store, "abc", { cookie: { maxAge: 60_000 } });
    const row = db.prepare("SELECT expire FROM sessions WHERE sid = ?").get("abc");
    const expireMs = new Date(row.expire).getTime();
    const nowMs = Date.now();
    assert.ok(expireMs > nowMs, "expire should be in the future");
    assert.ok(expireMs <= nowMs + 60_000 + 1_000, "expire should be ~60s from now");
  });

  test("set defaults to 1 day when maxAge is absent", async () => {
    await set(store, "abc", { cookie: {} });
    const row = db.prepare("SELECT expire FROM sessions WHERE sid = ?").get("abc");
    const expireMs = new Date(row.expire).getTime();
    const expectedMs = Date.now() + 86_400_000;
    assert.ok(
      Math.abs(expireMs - expectedMs) < 2_000,
      "expire should be ~1 day from now"
    );
  });
});
