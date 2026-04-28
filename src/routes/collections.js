import express from "express";
import {
  getAllCollections,
  createCollection,
  getCollectionBySlug,
  deleteManyCollectionsById,
  getImagesByCollectionSlug,
  removeImagesFromCollection,
  deleteManyById,
  getAdjacentImagesInCollection,
  getById,
} from "../db.js";
import { slugify } from "../slugify.js";
import logger from "../logger.js";
import { MIME_TO_EXT } from "../mimeTypes.js";
import { safeRedirect } from "../redirect.js";

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
    return res.status(400).render("collections", {
      collections,
      error: "Name must contain at least one letter or number.",
    });
  }

  const existing = getCollectionBySlug(slug);
  if (existing) {
    const collections = getAllCollections();
    return res.status(400).render("collections", {
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
      .render("collections", { collections, error: "Could not create collection." });
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

router.get("/:slug/image/:id", (req, res, next) => {
  const collection = getCollectionBySlug(req.params.slug);
  if (!collection) return next();

  const row = getById(req.params.id);
  if (!row) return res.status(404).render("error", { message: "Image not found." });

  const images = getImagesByCollectionSlug(req.params.slug);
  if (!images.some((img) => img.id === row.id)) {
    return res.status(404).render("error", { message: "Image not found in this collection." });
  }

  const ext = MIME_TO_EXT[row.mime_type];
  if (!ext) {
    logger.error("Unknown mime_type in database: %s (id=%s)", row.mime_type, row.id);
    return res.status(500).render("error", { message: "An unexpected error occurred." });
  }
  const { prevId, nextId } = getAdjacentImagesInCollection(row.id, req.params.slug);

  return res.render("image-detail", {
    id: row.id,
    mime_type: row.mime_type,
    created_at: row.created_at,
    imageSrc: `/image/${row.id}.${ext}`,
    prevUrl: prevId ? `/collections/${req.params.slug}/image/${prevId}` : null,
    nextUrl: nextId ? `/collections/${req.params.slug}/image/${nextId}` : null,
    context: "collection",
    collection,
    deleteReturnTo: `/collections/${req.params.slug}`,
  });
});

router.get("/:slug", (req, res, next) => {
  const collection = getCollectionBySlug(req.params.slug);
  if (!collection) return next();
  const images = getImagesByCollectionSlug(req.params.slug);
  res.render("collection-detail", { collection, images });
});

router.post("/:slug/remove", (req, res, next) => {
  const collection = getCollectionBySlug(req.params.slug);
  if (!collection) return next();
  let ids = req.body.ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length > 0) removeImagesFromCollection(ids, collection.id);

  const returnTo = req.body.returnTo;
  const safeReturnTo = safeRedirect(returnTo, `/collections/${req.params.slug}`);
  res.redirect(safeReturnTo);
});

router.post("/:slug/delete", (req, res, next) => {
  const collection = getCollectionBySlug(req.params.slug);
  if (!collection) return next();
  let ids = req.body.ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length > 0) {
    logger.info(
      "Permanently deleting images from collection %s: ids=%s",
      req.params.slug,
      ids.join(",")
    );
    deleteManyById(ids);
  }
  res.redirect(`/collections/${req.params.slug}`);
});

export default router;
