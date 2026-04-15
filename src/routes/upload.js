const express = require("express");
const multer = require("multer");
const { generateThumbnail } = require("../thumbnail");
const { insertImage } = require("../db");
const logger = require("../logger");

const router = express.Router();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES, 10) || 2097152;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error("Unsupported image type"), { code: "INVALID_MIME" }));
    }
  },
});

router.get("/", (req, res) => {
  const success = req.query.success === "1" ? true : null;
  const error = req.query.error ? decodeURIComponent(req.query.error) : null;
  res.render("upload", { success, error });
});

router.post("/upload/file", (req, res) => {
  upload.single("image")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        logger.warn("File upload rejected: file too large");
        return res.redirect("/?error=File+too+large");
      }
      if (err.code === "INVALID_MIME") {
        logger.warn("File upload rejected: unsupported MIME type");
        return res.redirect("/?error=Unsupported+image+type");
      }
      logger.warn("File upload failed: %s", err.message);
      return res.redirect("/?error=Upload+failed");
    }

    if (!req.file) {
      logger.warn("File upload rejected: no file received");
      return res.redirect("/?error=Upload+failed");
    }

    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      logger.warn("File upload rejected: unsupported MIME type %s", req.file.mimetype);
      return res.redirect("/?error=Unsupported+image+type");
    }

    try {
      const thumbBuffer = await generateThumbnail(req.file.buffer);
      insertImage(req.file.mimetype, req.file.buffer, thumbBuffer);

      logger.info("File uploaded successfully (%s)", req.file.mimetype);
      return res.redirect("/?success=1");
    } catch (uploadErr) {
      logger.error("File upload processing failed: %s", uploadErr.message);
      return res.redirect("/?error=Upload+failed");
    }
  });
});

router.post("/upload/url", async (req, res) => {
  const { url } = req.body;

  if (!url || !/^https?:\/\//i.test(url)) {
    logger.warn("URL upload rejected: invalid URL");
    return res.redirect("/?error=Invalid+URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn("URL upload failed: HTTP %d from remote", response.status);
      return res.redirect("/?error=Could+not+fetch+image");
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_UPLOAD_BYTES) {
      logger.warn("URL upload rejected: remote content-length exceeds limit");
      return res.redirect("/?error=File+too+large");
    }

    const contentType = response.headers.get("content-type") || "";
    const mime = contentType.split(";")[0].trim();
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      logger.warn("URL upload rejected: unsupported MIME type %s", mime);
      return res.redirect("/?error=Unsupported+image+type");
    }

    // Stream body into buffer while checking size
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_UPLOAD_BYTES) {
        reader.cancel();
        return res.redirect("/?error=File+too+large");
      }
      chunks.push(value);
    }

    const imageBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));

    const thumbBuffer = await generateThumbnail(imageBuffer);
    insertImage(mime, imageBuffer, thumbBuffer);

    logger.info("URL upload succeeded (%s)", mime);
    return res.redirect("/?success=1");
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      logger.warn("URL upload failed: request timed out");
      return res.redirect("/?error=Could+not+fetch+image");
    }
    logger.error("URL upload failed: %s", err.message);
    return res.redirect("/?error=Could+not+fetch+image");
  }
});

module.exports = router;
