const express = require('express');
const { stmts } = require('../db');
const { decrypt } = require('../crypto');

const router = express.Router();

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

router.get('/image/:id', (req, res) => {
  const row = stmts.getById.get(req.params.id);
  if (!row) {
    return res.status(404).render('error', { message: 'Image not found.' });
  }
  try {
    const imageBuffer = decrypt({
      iv: row.iv_image,
      ciphertext: row.image_data,
      authTag: row.auth_tag_image,
    });
    const imageDataUri = `data:${row.mime_type};base64,${imageBuffer.toString('base64')}`;
    return res.render('image', {
      id: row.id,
      mime_type: row.mime_type,
      created_at: row.created_at,
      imageDataUri,
    });
  } catch (_) {
    return res.status(500).render('error', { message: 'Failed to load image.' });
  }
});

router.get('/image/:id/download', (req, res) => {
  const row = stmts.getById.get(req.params.id);
  if (!row) {
    return res.status(404).render('error', { message: 'Image not found.' });
  }
  try {
    const imageBuffer = decrypt({
      iv: row.iv_image,
      ciphertext: row.image_data,
      authTag: row.auth_tag_image,
    });
    const ext = MIME_TO_EXT[row.mime_type] || 'bin';
    res.set('Content-Type', row.mime_type);
    res.set('Content-Disposition', `attachment; filename="photo-${row.id}.${ext}"`);
    return res.send(imageBuffer);
  } catch (_) {
    return res.status(500).render('error', { message: 'Failed to download image.' });
  }
});

router.post('/image/:id/delete', (req, res) => {
  stmts.deleteById.run(req.params.id);
  return res.redirect('/gallery');
});

module.exports = router;
