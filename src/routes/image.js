import express from "express";
import { getById, deleteById, getAdjacentImages } from "../db.js";
import { getImage, getThumb } from "../imageService.js";
import logger from "../logger.js";
import { MIME_TO_EXT } from "../mimeTypes.js";
import { safeRedirect } from "../redirect.js";

const router = express.Router();

router.get("/:id.:ext", (req, res) => {
  try {
    const { id } = req.params;
    const etag = `"${id}"`;

    if (req.headers["if-none-match"] === etag) {
      const row = getById(id);
      if (row) return res.status(304).end();
    }

    const result = getImage(id);
    if (!result) {
      logger.warn("Image not found: id=%s", id);
      return res.status(404).render("error", { message: "Image not found." });
    }
    res.set("Content-Type", result.mime_type);
    res.set("Cache-Control", "private, max-age=3600");
    res.set("ETag", etag);
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
  const ext = MIME_TO_EXT[row.mime_type];
  if (!ext) {
    logger.error("Unknown mime_type in database: %s (id=%s)", row.mime_type, row.id);
    return res.status(500).render("error", { message: "An unexpected error occurred." });
  }
  const { prevId, nextId } = getAdjacentImages(row.id);
  return res.render("image-detail", {
    id: row.id,
    mime_type: row.mime_type,
    created_at: row.created_at,
    imageSrc: `/image/${row.id}.${ext}`,
    prevUrl: prevId ? `/image/${prevId}` : null,
    nextUrl: nextId ? `/image/${nextId}` : null,
    context: "allimages",
    collection: null,
    deleteReturnTo: "/allimages",
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
    const ext = MIME_TO_EXT[result.mime_type];
    if (!ext) {
      logger.error("Unknown mime_type in database: %s (id=%s)", result.mime_type, result.id);
      return res.status(500).render("error", { message: "An unexpected error occurred." });
    }
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
    const returnTo = req.body.returnTo;
    const safeReturnTo = safeRedirect(returnTo, "/allimages");
    return res.redirect(safeReturnTo);
  } catch (err) {
    logger.error("Image delete failed: id=%s: %s", id, err.message);
    return next(err);
  }
});

export default router;
