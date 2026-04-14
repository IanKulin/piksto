require('dotenv').config();

// Validate ENCRYPTION_KEY at startup
const key = process.env.ENCRYPTION_KEY;
if (!key || key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
  console.error('ERROR: ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes).');
  process.exit(1);
}

const express = require('express');
const path = require('path');

// Initialize database on startup
require('./src/db');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const uploadRouter = require('./src/routes/upload');
app.use('/', uploadRouter);

module.exports = app;
