import express from "express";
import { getById, deleteById, getAdjacentImages } from "../db.js";
import { getImage, getThumb } from "../imageService.js";
import logger from "../logger.js";

const router = express.Router();

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

router.get("/:id.:ext", (req, res) => {
  try {
    const result = getImage(req.params.id);
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

router.get("/:id", (req, res) => {
  const row = getById(req.params.id);
  if (!row) {
    logger.warn("Image not found: id=%s", req.params.id);
    return res.status(404).render("error", { message: "Image not found." });
  }
  const ext = MIME_TO_EXT[row.mime_type] || "bin";
  const { prevId, nextId } = getAdjacentImages(row.id);
  return res.render("image", {
    id: row.id,
    mime_type: row.mime_type,
    created_at: row.created_at,
    imageSrc: `/image/${row.id}.${ext}`,
    prevId,
    nextId,
  });
});

router.get("/:id/thumb.jpg", (req, res) => {
  try {
    const result = getThumb(req.params.id);
    if (!result) {
      logger.warn("Thumbnail not found: id=%s", req.params.id);
      return res.status(404).render("error", { message: "Image not found." });
    }
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    return res.send(result.thumbBuffer);
  } catch (err) {
    logger.error("Failed to decrypt thumbnail id=%s: %s", req.params.id, err.message);
    return res.status(500).render("error", { message: "Failed to load thumbnail." });
  }
});

router.get("/:id/download", (req, res) => {
  try {
    const result = getImage(req.params.id);
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

router.post("/:id/delete", (req, res, next) => {
  const { id } = req.params;
  try {
    deleteById(id);
    logger.info("Image deleted: id=%s", id);
    return res.redirect("/gallery");
  } catch (err) {
    logger.error("Image delete failed: id=%s: %s", id, err.message);
    return next(err);
  }
});

export default router;
