import { encrypt, decrypt } from "./crypto.js";
import { insertRaw, getById, updateCommentRaw } from "./db.js";
import { generateThumbnail } from "./thumbnail.js";
import { maybeConvertWebp } from "./webpConverter.js";

function encryptNullable(str) {
  if (str == null) return { iv: null, ciphertext: null, authTag: null };
  const { iv, ciphertext, authTag } = encrypt(Buffer.from(str, "utf8"));
  return { iv, ciphertext, authTag };
}

function decryptNullable({ iv, ciphertext, authTag }) {
  if (iv == null) return null;
  return decrypt({ iv, ciphertext, authTag }).toString("utf8");
}

function saveImage(mime, imageBuffer, thumbBuffer, url = null, comment = null) {
  const encImage = encrypt(imageBuffer);
  const encThumb = encrypt(thumbBuffer);
  const encUrl = encryptNullable(url);
  const encComment = encryptNullable(comment);
  return insertRaw(mime, encImage, encThumb, encUrl, encComment);
}

function getImage(id) {
  const row = getById(id);
  if (!row) return null;
  const imageBuffer = decrypt({
    iv: row.iv_image,
    ciphertext: row.image_data,
    authTag: row.auth_tag_image,
  });
  return {
    id: row.id,
    mime_type: row.mime_type,
    created_at: row.created_at,
    url: decryptNullable({ iv: row.iv_url, ciphertext: row.url_data, authTag: row.auth_tag_url }),
    comment: decryptNullable({
      iv: row.iv_comment,
      ciphertext: row.comment_data,
      authTag: row.auth_tag_comment,
    }),
    imageBuffer,
  };
}

function getThumb(id) {
  const row = getById(id);
  if (!row) return null;
  const thumbBuffer = decrypt({
    iv: row.iv_thumb,
    ciphertext: row.thumb_data,
    authTag: row.auth_tag_thumb,
  });
  return { id: row.id, mime_type: row.mime_type, created_at: row.created_at, thumbBuffer };
}

async function storeUpload(imageBuffer, mimeType, sourceUrl = null) {
  ({ buffer: imageBuffer, mimeType } = await maybeConvertWebp(imageBuffer, mimeType));
  const thumbBuffer = await generateThumbnail(imageBuffer);
  return saveImage(mimeType, imageBuffer, thumbBuffer, sourceUrl);
}

function setComment(id, comment) {
  const enc = encryptNullable(comment);
  updateCommentRaw(id, enc);
}

export { saveImage, getImage, getThumb, storeUpload, setComment };
