import express from "express";
import rateLimit from "express-rate-limit";
import { ping } from "../db.js";

const router = express.Router();

const healthRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/health", healthRateLimit, (req, res) => {
  let dbStatus = "ok";
  try {
    ping();
  } catch {
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";
  res.status(status === "ok" ? 200 : 503).json({
    status,
    version: req.app.locals.version,
    db: dbStatus,
  });
});

export default router;
