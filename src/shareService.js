import crypto from "crypto";
import bcrypt from "bcrypt";
import sharp from "sharp";
import { createShare as insertShare, getShareByTokenHash, getCollectionById } from "./db.js";

const EXPIRY_PRESETS = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
};

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function createShare(collection, { password, expiryPreset, stripMetadata }) {
  if (!Object.hasOwn(EXPIRY_PRESETS, expiryPreset)) {
    throw new Error("Invalid expiry preset");
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const expiresAt = new Date(Date.now() + EXPIRY_PRESETS[expiryPreset]).toISOString();
  const id = insertShare({
    collectionId: collection.id,
    tokenHash: hashToken(token),
    passwordHash,
    stripMetadata,
    expiresAt,
  });
  return { id, token, expiresAt };
}

function resolveShare(token) {
  if (typeof token !== "string" || !token) return null;
  const share = getShareByTokenHash(hashToken(token));
  if (!share) return null;
  if (Date.now() > Date.parse(share.expires_at)) return null;
  const collection = getCollectionById(share.collection_id);
  if (!collection) return null;
  return { share, collection };
}

function verifyPassword(share, candidate) {
  if (!share.password_hash) return Promise.resolve(true);
  return bcrypt.compare(String(candidate ?? ""), share.password_hash);
}

async function stripImageMetadata(buffer) {
  const meta = await sharp(buffer).metadata();
  if ((meta.pages ?? 1) > 1 || meta.format === "gif") return buffer;
  const img = sharp(buffer).rotate();
  switch (meta.format) {
    case "jpeg":
      return img.jpeg({ quality: 95 }).toBuffer();
    case "png":
      return img.png().toBuffer();
    case "webp":
      return img.webp({ quality: 95 }).toBuffer();
    case "avif":
      return img.avif({ quality: 80 }).toBuffer();
    default:
      return img.toBuffer();
  }
}

export { EXPIRY_PRESETS, hashToken, createShare, resolveShare, verifyPassword, stripImageMetadata };
