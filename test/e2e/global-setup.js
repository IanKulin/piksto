const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

module.exports = async function globalSetup() {
  const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, '../../data/test.db'));
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath);
    db.exec('DELETE FROM images');
    db.close();
  }
};
