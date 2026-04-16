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

const express = require("express");
const path = require("path");
const session = require("express-session");
const { version } = require("./package.json");
const logger = require("./src/logger");

// Initialize database on startup
require("./src/db");

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

const authRouter = require("./src/routes/auth");
const requireAuth = require("./src/middleware/requireAuth");
const uploadRouter = require("./src/routes/upload");
const galleryRouter = require("./src/routes/gallery");
const imageRouter = require("./src/routes/image");

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

module.exports = app;
