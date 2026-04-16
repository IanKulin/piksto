import express from "express";
import path from "path";
import session from "express-session";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import logger from "./src/logger.js";
import "./src/db.js";
import authRouter from "./src/routes/auth.js";
import requireAuth from "./src/middleware/requireAuth.js";
import uploadRouter from "./src/routes/upload.js";
import galleryRouter from "./src/routes/gallery.js";
import imageRouter from "./src/routes/image.js";

// Validate ENCRYPTION_KEY at startup
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

const require = createRequire(import.meta.url);
const { version } = require("./package.json");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.locals.version = version;
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  })
);

app.use("/", authRouter);
app.use("/", requireAuth, uploadRouter);
app.use("/gallery", requireAuth, galleryRouter);
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
