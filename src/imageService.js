const { encrypt, decrypt } = require("./crypto");
const { stmts, insertRaw } = require("./db");
const { generateThumbnail } = require("./thumbnail");

function saveImage(mime, imageBuffer, thumbBuffer) {
  const encImage = encrypt(imageBuffer);
  const encThumb = encrypt(thumbBuffer);
  return insertRaw(mime, encImage, encThumb);
}

function getImage(id) {
  const row = stmts.getById.get(id);
  if (!row) return null;
  const imageBuffer = decrypt({
    iv: row.iv_image,
    ciphertext: row.image_data,
    authTag: row.auth_tag_image,
  });
  return { id: row.id, mime_type: row.mime_type, created_at: row.created_at, imageBuffer };
}

function getThumb(id) {
  const row = stmts.getById.get(id);
  if (!row) return null;
  const thumbBuffer = decrypt({
    iv: row.iv_thumb,
    ciphertext: row.thumb_data,
    authTag: row.auth_tag_thumb,
  });
  return { id: row.id, mime_type: row.mime_type, created_at: row.created_at, thumbBuffer };
}

async function storeUpload(imageBuffer, mimeType) {
  const thumbBuffer = await generateThumbnail(imageBuffer);
  return saveImage(mimeType, imageBuffer, thumbBuffer);
}

module.exports = { saveImage, getImage, getThumb, storeUpload };
