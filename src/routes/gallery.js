const express = require("express");
const { stmts } = require("../db");
const logger = require("../logger");
const router = express.Router();

router.get("/gallery", (req, res) => {
  try {
    const rows = stmts.getAll.all();
    const images = rows.map((row) => ({ id: row.id, created_at: row.created_at }));
    res.render("gallery", { images });
  } catch (err) {
    logger.error("Failed to load gallery: %s", err.message);
    res.status(500).render("error", { message: "Failed to load gallery." });
  }
});

module.exports = router;
