const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { chromium } = require("@playwright/test");

module.exports = async function globalSetup() {
  const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, "../../data/test.db"));
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath);
    db.exec("DELETE FROM images");
    db.close();
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:3000/login");
  await page.fill('input[name="username"]', process.env.AUTH_USERNAME || "admin");
  await page.fill('input[name="password"]', "testpassword");
  await page.click('button[type="submit"]');
  await page.waitForURL("http://localhost:3000/");

  await context.storageState({ path: "test/e2e/.auth.json" });
  await browser.close();
};
