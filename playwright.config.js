import { defineConfig } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set DB_PATH for both the test worker processes and the webServer process.
process.env.DB_PATH = process.env.DB_PATH || path.join(__dirname, "data/test.db");

export default defineConfig({
  globalSetup: "./test/e2e/global-setup.js",
  testDir: "./test/e2e",
  workers: 1, // Tests share a single SQLite DB; parallel workers cause getLastImageId() races
  use: {
    baseURL: "http://localhost:3000",
    storageState: "test/e2e/.auth.json",
  },
  webServer: {
    command: "node server.js",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      ...process.env,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "a".repeat(64),
      PORT: "3000",
      DB_PATH: process.env.DB_PATH,
      SESSION_SECRET: process.env.SESSION_SECRET || "test-session-secret",
      AUTH_USERNAME: process.env.AUTH_USERNAME || "admin",
      AUTH_PASSWORD_HASH:
        process.env.AUTH_PASSWORD_HASH ||
        "$2b$12$ADdKcr2Prag0NdXvvVCsB.fP8WBpqDkEwTleKYWflABJt6HKlNV.a",
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
