import crypto from "crypto";
import express from "express";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/login", (req, res) => {
  if (req.session.authenticated) return res.redirect("/");
  res.render("login", { error: null });
});

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const expectedUsername = process.env.AUTH_USERNAME || "admin";
  const passwordHash = process.env.AUTH_PASSWORD_HASH;

  const usernameMatch = (() => {
    const a = Buffer.from(String(username));
    const b = Buffer.from(expectedUsername);
    if (a.length !== b.length) {
      crypto.timingSafeEqual(b, b);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  })();
  const passwordMatch = passwordHash ? await bcrypt.compare(password || "", passwordHash) : false;

  if (!usernameMatch || !passwordMatch) {
    return res.status(400).render("login", { error: "Invalid username or password." });
  }

  req.session.authenticated = true;
  req.session.username = username;
  res.redirect("/");
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

export default router;
