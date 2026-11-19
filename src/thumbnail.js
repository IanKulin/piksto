import sharp from "sharp";

async function generateThumbnail(inputBuffer) {
  return sharp(inputBuffer)
    .rotate() // apply EXIF orientation; output metadata is stripped
    .resize(400, 400, { fit: "cover", position: "centre" })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export { generateThumbnail };
