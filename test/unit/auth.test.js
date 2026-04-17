import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

// Tests for the timing-safe username comparison used in src/routes/auth.js.
// The comparison logic is mirrored here so changes to the implementation
// must be reflected in both places.
function timingSafeUsernameMatch(username, expectedUsername) {
  const a = Buffer.from(String(username));
  const b = Buffer.from(expectedUsername);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

describe("timing-safe username comparison", () => {
  test("correct username matches", () => {
    assert.equal(timingSafeUsernameMatch("admin", "admin"), true);
  });

  test("wrong username of the same length does not match", () => {
    assert.equal(timingSafeUsernameMatch("xdmin", "admin"), false);
  });

  test("wrong username of different length does not match", () => {
    assert.equal(timingSafeUsernameMatch("administrator", "admin"), false);
  });

  test("empty username does not match", () => {
    assert.equal(timingSafeUsernameMatch("", "admin"), false);
  });
});
