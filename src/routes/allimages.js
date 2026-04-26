import express from "express";
import { getAllImages, deleteManyById } from "../db.js";
import logger from "../logger.js";

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const rows = getAllImages();
    const images = rows.map((row) => ({ id: row.id, created_at: row.created_at }));
    res.render("allimages", { images, page: "allimages" });
  } catch (err) {
    logger.error("Failed to load all images: %s", err.message);
    res.status(500).render("error", { message: "Failed to load images." });
  }
});

router.post("/delete", (req, res) => {
  const raw = [].concat(req.body?.ids ?? []);
  if (raw.length === 0) {
    return res.redirect("/allimages");
  }
  const ids = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    return res.redirect("/allimages");
  }
  try {
    deleteManyById(ids);
    logger.info("Bulk deleted %d image(s): %s", ids.length, ids.join(","));
  } catch (err) {
    logger.error("Bulk delete failed: %s", err.message);
  }
  return res.redirect("/allimages");
});

export default router;
