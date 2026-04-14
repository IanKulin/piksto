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
app.use(express.urlencoded({ extended: false }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const uploadRouter = require('./src/routes/upload');
const galleryRouter = require('./src/routes/gallery');
const imageRouter = require('./src/routes/image');
app.use('/', uploadRouter);
app.use('/', galleryRouter);
app.use('/', imageRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).render('error', { message: 'Page not found.' });
});

// 500 handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { message: 'An unexpected error occurred.' });
});

module.exports = app;
