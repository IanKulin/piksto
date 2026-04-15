const express = require("express");
const { stmts, getDecryptedImage, getDecryptedThumb } = require("../db");
const logger = require("../logger");

const router = express.Router();

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

router.get("/image/:id.:ext", (req, res) => {
  try {
    const result = getDecryptedImage(req.params.id);
    if (!result) {
      logger.warn("Image not found: id=%s", req.params.id);
      return res.status(404).render("error", { message: "Image not found." });
    }
    res.set("Content-Type", result.mime_type);
    return res.send(result.imageBuffer);
  } catch (err) {
    logger.error("Failed to decrypt image id=%s: %s", req.params.id, err.message);
    return res.status(500).render("error", { message: "Failed to load image." });
  }
});

router.get("/image/:id", (req, res) => {
  const row = stmts.getById.get(req.params.id);
  if (!row) {
    logger.warn("Image not found: id=%s", req.params.id);
    return res.status(404).render("error", { message: "Image not found." });
  }
  const ext = MIME_TO_EXT[row.mime_type] || "bin";
  return res.render("image", {
    id: row.id,
    mime_type: row.mime_type,
    created_at: row.created_at,
    imageSrc: `/image/${row.id}.${ext}`,
  });
});

router.get("/image/:id/thumb.jpg", (req, res) => {
  try {
    const result = getDecryptedThumb(req.params.id);
    if (!result) {
      logger.warn("Thumbnail not found: id=%s", req.params.id);
      return res.status(404).render("error", { message: "Image not found." });
    }
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(result.thumbBuffer);
  } catch (err) {
    logger.error("Failed to decrypt thumbnail id=%s: %s", req.params.id, err.message);
    return res.status(500).render("error", { message: "Failed to load thumbnail." });
  }
});

router.get("/image/:id/download", (req, res) => {
  try {
    const result = getDecryptedImage(req.params.id);
    if (!result) {
      logger.warn("Download not found: id=%s", req.params.id);
      return res.status(404).render("error", { message: "Image not found." });
    }
    const ext = MIME_TO_EXT[result.mime_type] || "bin";
    res.set("Content-Type", result.mime_type);
    res.set("Content-Disposition", `attachment; filename="photo-${result.id}.${ext}"`);
    return res.send(result.imageBuffer);
  } catch (err) {
    logger.error("Failed to decrypt image for download id=%s: %s", req.params.id, err.message);
    return res.status(500).render("error", { message: "Failed to download image." });
  }
});

router.post("/image/:id/delete", (req, res) => {
  stmts.deleteById.run(req.params.id);
  return res.redirect("/gallery");
});

module.exports = router;
