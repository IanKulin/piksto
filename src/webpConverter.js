import sharp from "sharp";
import logger from "./logger.js";

const CONVERT = process.env.CONVERT_WEBP_TO_JPEG?.toLowerCase() !== "false";

async function maybeConvertWebp(buffer, mimeType) {
  if (!CONVERT || mimeType !== "image/webp") {
    return { buffer, mimeType };
  }
  const converted = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
  logger.info("WebP converted to JPEG on upload");
  return { buffer: converted, mimeType: "image/jpeg" };
}

export { maybeConvertWebp };
