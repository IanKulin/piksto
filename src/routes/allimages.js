import express from "express";
import { getAllImages, getUncollectedImages, deleteManyById } from "../db.js";
import logger from "../logger.js";

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const uncollected = req.query.collection === "none";
    const rows = uncollected ? getUncollectedImages() : getAllImages();
    const images = rows.map((row) => ({ id: row.id, created_at: row.created_at }));
    res.render("allimages", {
      images,
      uncollected,
      page: "allimages",
      deleteError: req.query.error === "1",
    });
  } catch (err) {
    logger.error("Failed to load all images: %s", err.message);
    res.status(500).render("error", { message: "Failed to load images." });
  }
});

router.post("/delete", (req, res) => {
  const base = req.body?.collection === "none" ? "/allimages?collection=none" : "/allimages";
  const raw = [].concat(req.body?.ids ?? []);
  if (raw.length === 0) {
    return res.redirect(base);
  }
  const ids = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    return res.redirect(base);
  }
  try {
    deleteManyById(ids);
    logger.info("Bulk deleted %d image(s): %s", ids.length, ids.join(","));
    return res.redirect(base);
  } catch (err) {
    logger.error("Bulk delete failed: %s", err.message);
    return res.redirect(`${base}${base.includes("?") ? "&" : "?"}error=1`);
  }
});

export default router;
