import sharp from "sharp";

async function generateThumbnail(inputBuffer) {
  return sharp(inputBuffer)
    .rotate() // apply EXIF orientation; output metadata is stripped
    .resize(300, 300, { fit: "inside" })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export { generateThumbnail };
