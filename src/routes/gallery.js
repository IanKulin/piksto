const express = require('express');
const { stmts } = require('../db');
const { decrypt } = require('../crypto');

const router = express.Router();

router.get('/gallery', (req, res) => {
  try {
    const rows = stmts.getAll.all();
    const images = rows.map((row) => {
      const thumbBuffer = decrypt({
        iv: row.iv_thumb,
        ciphertext: row.thumb_data,
        authTag: row.auth_tag_thumb,
      });
      const thumbDataUri = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
      return { id: row.id, created_at: row.created_at, thumbDataUri };
    });
    res.render('gallery', { images });
  } catch (_) {
    res.status(500).render('error', { message: 'Failed to load gallery.' });
  }
});

module.exports = router;
