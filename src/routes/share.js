import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { isImageInCollection, getImagesByCollectionId } from "../db.js";
import { getImage, getThumb } from "../imageService.js";
import { resolveShare, verifyPassword, stripImageMetadata } from "../shareService.js";
import { MIME_TO_EXT } from "../mimeTypes.js";
import logger from "../logger.js";

const router = express.Router();

const shareLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${req.params.token}`,
});

router.use(shareLimiter);

function notFound(res) {
  return res.status(404).render("share-not-found");
}

function isUnlocked(req, share) {
  return !share.password_hash || Boolean(req.session?.shareUnlocks?.[share.id]);
}

// `asset` routes answer a locked share with a bare 401; page routes show the password form.
function loadShare({ asset = false, requireUnlock = true } = {}) {
  return (req, res, next) => {
    res.set("X-Robots-Tag", "noindex, nofollow");
    const resolved = resolveShare(req.params.token);
    if (!resolved) return notFound(res);
    const { share, collection } = resolved;

    if (requireUnlock && !isUnlocked(req, share)) {
      if (asset) return res.status(401).end();
      return res.render("share-password", { token: req.params.token, error: null });
    }

    if (req.params.id !== undefined) {
      const imageId = Number(req.params.id);
      if (!Number.isInteger(imageId) || !isImageInCollection(imageId, share.collection_id)) {
        return notFound(res);
      }
    }

    req.share = share;
    req.collection = collection;
    next();
  };
}

// res.end rather than res.send: send adds an ETag, and share routes must never answer 304.
function setImageHeaders(res) {
  res.set("Cache-Control", "private, max-age=300");
}

router.get("/:token", loadShare(), (req, res) => {
  const images = getImagesByCollectionId(req.collection.id);
  logger.info(
    "Share viewed: shareId=%s collection=%s ip=%s",
    req.share.id,
    req.collection.slug,
    req.ip
  );
  res.render("share", {
    token: req.params.token,
    collectionName: req.collection.name,
    imageIds: images.map((img) => img.id),
  });
});

router.post(
  "/:token/unlock",
  unlockLimiter,
  loadShare({ requireUnlock: false }),
  async (req, res) => {
    const { share } = req;
    if (!(await verifyPassword(share, req.body.password))) {
      logger.warn("Share unlock failed: shareId=%s ip=%s", share.id, req.ip);
      return res
        .status(401)
        .render("share-password", { token: req.params.token, error: "Incorrect password." });
    }
    req.session.shareUnlocks = { ...req.session.shareUnlocks, [share.id]: true };
    logger.info("Share unlocked: shareId=%s ip=%s", share.id, req.ip);
    res.redirect(`/share/${req.params.token}`);
  }
);

router.get("/:token/image/:id/thumb.jpg", loadShare({ asset: true }), (req, res) => {
  const result = getThumb(req.params.id);
  if (!result) return notFound(res);
  setImageHeaders(res);
  res.set("Content-Type", "image/jpeg");
  res.end(result.thumbBuffer);
});

router.get("/:token/image/:id", loadShare({ asset: true }), async (req, res) => {
  const result = getImage(req.params.id);
  const ext = result && MIME_TO_EXT[result.mime_type];
  if (!ext) return notFound(res);
  const body = req.share.strip_metadata
    ? await stripImageMetadata(result.imageBuffer)
    : result.imageBuffer;
  logger.info("Share image opened: shareId=%s imageId=%s ip=%s", req.share.id, result.id, req.ip);
  setImageHeaders(res);
  res.set("Content-Type", result.mime_type);
  res.set("Content-Disposition", `inline; filename="photo-${result.id}.${ext}"`);
  res.end(body);
});

router.use((_req, res) => notFound(res));

router.use((err, _req, res, _next) => {
  logger.error(err.stack || err.message || String(err));
  res.status(500).render("share-not-found");
});

export default router;
