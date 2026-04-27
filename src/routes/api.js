import express from "express";
import { getAllCollections, getCollectionsForImage, toggleImageInCollection } from "../db.js";

const router = express.Router();

router.get("/collections", (_req, res) => {
  const collections = getAllCollections();
  res.json(collections.map(({ id, name, slug }) => ({ id, name, slug })));
});

router.get("/image/:id/collections", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  res.json(getCollectionsForImage(id));
});

router.post("/image/:id/collections/:collectionId/toggle", (req, res) => {
  const imageId = Number(req.params.id);
  const collectionId = Number(req.params.collectionId);
  if (
    !Number.isInteger(imageId) ||
    imageId <= 0 ||
    !Number.isInteger(collectionId) ||
    collectionId <= 0
  ) {
    return res.status(400).json({ error: "Invalid id" });
  }
  res.json(toggleImageInCollection(imageId, collectionId));
});

export default router;
