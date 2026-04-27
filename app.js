import express from "express";
import path from "path";
import session from "express-session";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import logger from "./src/logger.js";
import createSessionStore from "./src/sessionStore.js";
import "./src/db.js";
import sessionDb from "./src/sessionDb.js";
import authRouter from "./src/routes/auth.js";
import requireAuth from "./src/middleware/requireAuth.js";
import uploadRouter from "./src/routes/upload.js";
import allimagesRouter from "./src/routes/allimages.js";
import collectionsRouter from "./src/routes/collections.js";
import imageRouter from "./src/routes/image.js";
import healthRouter from "./src/routes/health.js";
import apiRouter from "./src/routes/api.js";

// Validate ENCRYPTION_KEY at startup
// console.error is used here intentionally: logger relies on a dynamic import
// that hasn't resolved yet at this point in startup.
const key = process.env.ENCRYPTION_KEY;
if (!key || key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
  console.error("ERROR: ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes).");
  process.exit(1);
}

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.error("ERROR: SESSION_SECRET must be set.");
  process.exit(1);
}
if (sessionSecret.length < 32) {
  console.warn(
    "WARNING: SESSION_SECRET is less than 32 characters; use a longer secret in production."
  );
}

const require = createRequire(import.meta.url);
const { version } = require("./package.json");
const SqliteStore = createSessionStore(session.Store);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Parse TRUST_PROXY from env (false | true | number | IP string)
const trustProxyEnv = process.env.TRUST_PROXY ?? "false";
let trustProxy;
if (trustProxyEnv === "false") {
  trustProxy = false;
} else if (trustProxyEnv === "true") {
  trustProxy = true;
} else if (/^\d+$/.test(trustProxyEnv)) {
  trustProxy = parseInt(trustProxyEnv, 10);
} else {
  // Express also accepts strings like "loopback" or comma-separated IPs
  trustProxy = trustProxyEnv;
}
app.set("trust proxy", trustProxy);

app.locals.version = version;

app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' blob: data:; object-src 'none'; base-uri 'self'"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  session({
    store: new SqliteStore({ client: sessionDb }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: process.env.SECURE_COOKIE === "true" },
  })
);

app.use("/", healthRouter);
app.use("/", authRouter);
app.use("/api", requireAuth, apiRouter);
app.use("/", requireAuth, uploadRouter);
app.get("/gallery", (_req, res) => res.redirect(301, "/allimages"));
app.use("/allimages", requireAuth, allimagesRouter);
app.use("/collections", requireAuth, collectionsRouter);
app.use("/image", requireAuth, imageRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).render("error", { message: "Page not found." });
});

// 500 handler
app.use((err, _req, res, _next) => {
  logger.error(err.message || String(err));
  res.status(500).render("error", { message: "An unexpected error occurred." });
});

export default app;
