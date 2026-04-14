const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('crypto helpers', () => {
  test('encrypt/decrypt roundtrip produces original plaintext', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const { encrypt, decrypt } = require('../../src/crypto');

    const original = Buffer.from('hello, photo-sink!');
    const { iv, ciphertext, authTag } = encrypt(original);
    const result = decrypt({ iv, ciphertext, authTag });

    assert.deepEqual(result, original);
  });

  test('encrypt produces different ciphertext each call (random IV)', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const { encrypt } = require('../../src/crypto');

    const buf = Buffer.from('same input');
    const first = encrypt(buf);
    const second = encrypt(buf);

    assert.notDeepEqual(first.iv, second.iv);
    assert.notDeepEqual(first.ciphertext, second.ciphertext);
  });

  test('encrypt produces 12-byte IV and 16-byte auth tag', () => {
    process.env.ENCRYPTION_KEY = 'b'.repeat(64);
    const { encrypt } = require('../../src/crypto');

    const { iv, authTag } = encrypt(Buffer.from('test'));

    assert.equal(iv.length, 12);
    assert.equal(authTag.length, 16);
  });

  test('decrypt throws when auth tag is tampered', () => {
    process.env.ENCRYPTION_KEY = 'c'.repeat(64);
    const { encrypt, decrypt } = require('../../src/crypto');

    const { iv, ciphertext, authTag } = encrypt(Buffer.from('secret'));
    const badTag = Buffer.alloc(16, 0xff);

    assert.throws(() => decrypt({ iv, ciphertext, authTag: badTag }));
  });

  test('decrypt throws when ciphertext is tampered', () => {
    process.env.ENCRYPTION_KEY = 'd'.repeat(64);
    const { encrypt, decrypt } = require('../../src/crypto');

    const { iv, ciphertext, authTag } = encrypt(Buffer.from('secret'));
    const badCiphertext = Buffer.from(ciphertext);
    badCiphertext[0] ^= 0xff;

    assert.throws(() => decrypt({ iv, ciphertext: badCiphertext, authTag }));
  });

  test('throws on missing ENCRYPTION_KEY', () => {
    delete process.env.ENCRYPTION_KEY;
    // Re-require since module is cached with old env — call directly
    const { encrypt } = require('../../src/crypto');

    assert.throws(() => encrypt(Buffer.from('x')), /ENCRYPTION_KEY/);
  });

  test('throws on key that is too short', () => {
    process.env.ENCRYPTION_KEY = 'deadbeef';
    const { encrypt } = require('../../src/crypto');

    assert.throws(() => encrypt(Buffer.from('x')), /ENCRYPTION_KEY/);
  });
});
