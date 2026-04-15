const { defineConfig } = require('@playwright/test');
const path = require('path');

// Set DB_PATH for both the test worker processes and the webServer process.
process.env.DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data/test.db');

module.exports = defineConfig({
  globalSetup: './test/e2e/global-setup.js',
  testDir: './test/e2e',
  workers: 1, // Tests share a single SQLite DB; parallel workers cause getLastImageId() races
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'node server.js',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...process.env,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'a'.repeat(64),
      PORT: '3000',
      DB_PATH: process.env.DB_PATH,
    },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
