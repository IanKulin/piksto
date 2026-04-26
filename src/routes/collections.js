import express from "express";
import {
  getAllCollections,
  createCollection,
  getCollectionBySlug,
  deleteManyCollectionsById,
} from "../db.js";
import { slugify } from "../slugify.js";
import logger from "../logger.js";

const router = express.Router();

router.get("/", (_req, res) => {
  const collections = getAllCollections();
  res.render("collections", { collections, error: null });
});

router.post("/", (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) {
    const collections = getAllCollections();
    return res.status(400).render("collections", { collections, error: "Name is required." });
  }

  const slug = slugify(name);
  if (!slug) {
    const collections = getAllCollections();
    return res
      .status(400)
      .render("collections", {
        collections,
        error: "Name must contain at least one letter or number.",
      });
  }

  const existing = getCollectionBySlug(slug);
  if (existing) {
    const collections = getAllCollections();
    return res
      .status(400)
      .render("collections", {
        collections,
        error: "A collection with a similar name already exists.",
      });
  }

  try {
    createCollection(name, slug);
  } catch (err) {
    logger.error("createCollection error: " + err.message);
    const collections = getAllCollections();
    return res
      .status(400)
      .render("collections", { collections, error: "A collection with that name already exists." });
  }

  res.redirect("/collections");
});

router.post("/delete", (req, res) => {
  let ids = req.body.ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length > 0) deleteManyCollectionsById(ids);
  res.redirect("/collections");
});

export default router;
