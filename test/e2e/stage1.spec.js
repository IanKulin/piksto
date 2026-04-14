const { test, expect } = require('@playwright/test');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

test.describe('Stage 1 — Project Scaffold & Server Startup', () => {
  test('server responds to HTTP requests', async ({ request }) => {
    // The webServer config ensures the server is already running.
    // Any HTTP response (including 404 before routes exist) confirms the server is up.
    const res = await request.get('/');
    expect(res.status()).not.toBe(0);
  });

  test('data/photosink.db file exists on disk', () => {
    const dbPath = path.join(__dirname, '../../data/photosink.db');
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  test('photosink.db contains the images table with correct schema', () => {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '../../data/photosink.db');
    const db = new Database(dbPath, { readonly: true });

    const cols = db.pragma('table_info(images)').map(c => c.name);
    db.close();

    expect(cols).toEqual([
      'id', 'mime_type', 'created_at',
      'iv_image', 'image_data',
      'iv_thumb', 'thumb_data',
      'auth_tag_image', 'auth_tag_thumb',
    ]);
  });

  test('server refuses to start without ENCRYPTION_KEY', () => {
    let exited = false;
    try {
      execSync('node server.js', {
        cwd: path.join(__dirname, '../..'),
        env: { ...process.env, ENCRYPTION_KEY: '' },
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (_) {
      exited = true;
    }
    expect(exited).toBe(true);
  });

  test('startup error message mentions ENCRYPTION_KEY', () => {
    let stderr = '';
    try {
      execSync('node server.js', {
        cwd: path.join(__dirname, '../..'),
        env: { ...process.env, ENCRYPTION_KEY: '' },
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      stderr = (err.stderr || Buffer.alloc(0)).toString();
      // Also check stdout in case the message goes there
      const stdout = (err.stdout || Buffer.alloc(0)).toString();
      const combined = stderr + stdout;
      expect(combined).toMatch(/ENCRYPTION_KEY/i);
      return;
    }
    throw new Error('Expected server to exit with error');
  });

  test('server refuses to start with a short (invalid) ENCRYPTION_KEY', () => {
    let exited = false;
    try {
      execSync('node server.js', {
        cwd: path.join(__dirname, '../..'),
        env: { ...process.env, ENCRYPTION_KEY: 'tooshort' },
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      exited = true;
      const combined = (err.stdout || '').toString() + (err.stderr || '').toString();
      expect(combined).toMatch(/ENCRYPTION_KEY/i);
    }
    expect(exited).toBe(true);
  });
});
