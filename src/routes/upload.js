const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const success = req.query.success === '1' ? true : null;
  const error = req.query.error ? decodeURIComponent(req.query.error) : null;
  res.render('upload', { success, error });
});

router.post('/upload/file', (req, res) => {
  res.redirect('/?error=Not+implemented');
});

router.post('/upload/url', (req, res) => {
  res.redirect('/?error=Not+implemented');
});

module.exports = router;
