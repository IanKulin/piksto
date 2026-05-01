import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { fileTypeFromBuffer } from "file-type";
import { storeUpload } from "../imageService.js";
import logger from "../logger.js";
import { assertSafeUrl, SsrfBlockedError } from "../ssrfGuard.js";

const router = express.Router();

const uploadRateLimit = rateLimit({
  windowMs: parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
  max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    logger.warn("Upload rate limit exceeded");
    res
      .status(429)
      .render("upload", { error: "Too many uploads. Please try again later.", success: null });
  },
});

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];
const MAX_UPLOAD_BYTES = (() => {
  if (process.env.MAX_UPLOAD_MB !== undefined) {
    return Math.round(parseFloat(process.env.MAX_UPLOAD_MB) * 1024 * 1024);
  }
  if (process.env.MAX_UPLOAD_BYTES !== undefined) {
    return parseInt(process.env.MAX_UPLOAD_BYTES, 10);
  }
  return 2 * 1024 * 1024;
})();

async function validateImageBuffer(buffer, declaredMime) {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
    throw Object.assign(new Error("File content does not match an allowed image type"), {
      code: "INVALID_MAGIC_BYTES",
    });
  }
  if (detected.mime !== declaredMime) {
    logger.warn(
      "MIME mismatch: declared=%s detected=%s — using detected type",
      declaredMime,
      detected.mime
    );
  }
  return detected.mime;
}

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
  res.render("upload", { success, error: null });
});

router.post("/upload/file", uploadRateLimit, (req, res) => {
  upload.single("image")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        logger.warn("File upload rejected: file too large");
        return res.status(400).render("upload", { error: "File too large", success: null });
      }
      if (err.code === "INVALID_MIME") {
        logger.warn("File upload rejected: unsupported MIME type");
        return res.status(400).render("upload", { error: "Unsupported image type", success: null });
      }
      logger.warn("File upload failed: %s", err.message);
      return res.status(400).render("upload", { error: "Upload failed", success: null });
    }

    if (!req.file) {
      logger.warn("File upload rejected: no file received");
      return res.status(400).render("upload", { error: "Upload failed", success: null });
    }

    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      logger.warn("File upload rejected: unsupported MIME type %s", req.file.mimetype);
      return res.status(400).render("upload", { error: "Unsupported image type", success: null });
    }

    let verifiedMime;
    try {
      verifiedMime = await validateImageBuffer(req.file.buffer, req.file.mimetype);
    } catch (magicErr) {
      logger.warn("File upload rejected: %s", magicErr.message);
      return res.status(400).render("upload", { error: "Unsupported image type", success: null });
    }

    try {
      await storeUpload(req.file.buffer, verifiedMime);

      logger.info("File uploaded successfully (%s)", verifiedMime);
      return res.redirect("/?success=1");
    } catch (uploadErr) {
      logger.error("File upload processing failed: %s", uploadErr.message);
      return res.status(400).render("upload", { error: "Upload failed", success: null });
    }
  });
});

router.post("/upload/url", uploadRateLimit, async (req, res) => {
  const { url } = req.body;

  if (!url) {
    logger.warn("URL upload rejected: no URL provided");
    return res.status(400).render("upload", { error: "Invalid URL", success: null });
  }

  try {
    await assertSafeUrl(url);
  } catch (guardErr) {
    logger.warn("URL upload rejected: %s", guardErr.message);
    return res.status(400).render("upload", { error: "Invalid URL", success: null });
  }

  // Strip query parameters and try that URL first to avoid lossy format conversions
  // (e.g. ?format=webp). Fall back to the original URL if the stripped version fails.
  let strippedUrl;
  try {
    const parsed = new URL(url);
    if (parsed.search) {
      parsed.search = "";
      strippedUrl = parsed.toString();
    }
  } catch {
    // If URL parsing fails, proceed with original (assertSafeUrl already validated it)
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    let response;
    if (strippedUrl) {
      logger.info("URL upload: trying without query params (%s)", strippedUrl);
      // redirect: "error" is intentional — prevents redirect-based SSRF bypass (public URL -> internal address)
      const r = await fetch(strippedUrl, { signal: controller.signal, redirect: "error" });
      if (r.ok) {
        response = r;
      } else {
        logger.info(
          "URL upload: stripped URL returned HTTP %d, falling back to original",
          r.status
        );
        await r.body?.cancel();
      }
    }
    if (!response) {
      // redirect: "error" is intentional — prevents redirect-based SSRF bypass (public URL -> internal address)
      response = await fetch(url, { signal: controller.signal, redirect: "error" });
    }
    if (!response.ok) {
      logger.warn("URL upload failed: HTTP %d from remote", response.status);
      return res.status(400).render("upload", { error: "Could not fetch image", success: null });
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_UPLOAD_BYTES) {
      logger.warn("URL upload rejected: remote content-length exceeds limit");
      return res.status(400).render("upload", { error: "File too large", success: null });
    }

    const contentType = response.headers.get("content-type") || "";
    const mime = contentType.split(";")[0].trim();
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      logger.warn("URL upload rejected: unsupported MIME type %s", mime);
      return res.status(400).render("upload", { error: "Unsupported image type", success: null });
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
        return res.status(400).render("upload", { error: "File too large", success: null });
      }
      chunks.push(value);
    }

    const imageBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));

    let verifiedMime;
    try {
      verifiedMime = await validateImageBuffer(imageBuffer, mime);
    } catch (magicErr) {
      logger.warn("URL upload rejected: %s", magicErr.message);
      return res.status(400).render("upload", { error: "Unsupported image type", success: null });
    }

    await storeUpload(imageBuffer, verifiedMime, url);

    logger.info("URL upload succeeded (%s)", verifiedMime);
    return res.redirect("/?success=1");
  } catch (err) {
    if (err.name === "AbortError") {
      logger.warn("URL upload failed: request timed out");
      return res.status(400).render("upload", { error: "Could not fetch image", success: null });
    }
    if (err instanceof SsrfBlockedError) {
      logger.warn("URL upload rejected: %s", err.message);
      return res.status(400).render("upload", { error: "Invalid URL", success: null });
    }
    logger.error("URL upload failed: %s", err.message);
    return res.status(400).render("upload", { error: "Could not fetch image", success: null });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
