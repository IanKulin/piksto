import db from "./connection.js";

const stmts = {
  insert: db.prepare(`
    INSERT INTO images (mime_type, iv_image, image_data, iv_thumb, thumb_data, auth_tag_image, auth_tag_thumb, iv_url, url_data, auth_tag_url, iv_comment, comment_data, auth_tag_comment)
    VALUES (@mime_type, @iv_image, @image_data, @iv_thumb, @thumb_data, @auth_tag_image, @auth_tag_thumb, @iv_url, @url_data, @auth_tag_url, @iv_comment, @comment_data, @auth_tag_comment)
  `),
  getAll: db.prepare("SELECT id, created_at FROM images ORDER BY created_at ASC"),
  getUncollected: db.prepare(`
    SELECT id, created_at FROM images
    WHERE NOT EXISTS (SELECT 1 FROM image_collections WHERE image_id = images.id)
    ORDER BY created_at ASC
  `),
  getById: db.prepare("SELECT * FROM images WHERE id = ?"),
  deleteById: db.prepare("DELETE FROM images WHERE id = ?"),
  prevImage: db.prepare(`
    SELECT id FROM images
    WHERE created_at < (SELECT created_at FROM images WHERE id = ?)
       OR (created_at = (SELECT created_at FROM images WHERE id = ?) AND id < ?)
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `),
  nextImage: db.prepare(`
    SELECT id FROM images
    WHERE created_at > (SELECT created_at FROM images WHERE id = ?)
       OR (created_at = (SELECT created_at FROM images WHERE id = ?) AND id > ?)
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `),
  updateComment: db.prepare(`
    UPDATE images
    SET iv_comment = @iv_comment, comment_data = @comment_data, auth_tag_comment = @auth_tag_comment
    WHERE id = @id
  `),
  ping: db.prepare("SELECT 1"),
};

function insertRaw(mime, encImage, encThumb, encUrl = null, encComment = null) {
  return stmts.insert.run({
    mime_type: mime,
    iv_image: encImage.iv,
    image_data: encImage.ciphertext,
    auth_tag_image: encImage.authTag,
    iv_thumb: encThumb.iv,
    thumb_data: encThumb.ciphertext,
    auth_tag_thumb: encThumb.authTag,
    iv_url: encUrl?.iv ?? null,
    url_data: encUrl?.ciphertext ?? null,
    auth_tag_url: encUrl?.authTag ?? null,
    iv_comment: encComment?.iv ?? null,
    comment_data: encComment?.ciphertext ?? null,
    auth_tag_comment: encComment?.authTag ?? null,
  });
}

function updateCommentRaw(id, encComment) {
  stmts.updateComment.run({
    id,
    iv_comment: encComment.iv,
    comment_data: encComment.ciphertext,
    auth_tag_comment: encComment.authTag,
  });
}

function deleteManyById(ids) {
  const valid = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (valid.length === 0) return;
  const placeholders = valid.map(() => "?").join(",");
  db.prepare(`DELETE FROM images WHERE id IN (${placeholders})`).run(...valid);
}

function getAllImages() {
  return stmts.getAll.all();
}

function getUncollectedImages() {
  return stmts.getUncollected.all();
}

function getById(id) {
  return stmts.getById.get(id);
}

function deleteById(id) {
  return stmts.deleteById.run(id);
}

function getAdjacentImages(id) {
  const prev = stmts.prevImage.get(id, id, id);
  const next = stmts.nextImage.get(id, id, id);
  return { prevId: prev?.id ?? null, nextId: next?.id ?? null };
}

function ping() {
  stmts.ping.get();
}

function closeDb() {
  db.close();
}

const testHelpers = {
  getRawById: (id) => stmts.getById.get(id),
};

export {
  insertRaw,
  updateCommentRaw,
  deleteManyById,
  getAllImages,
  getUncollectedImages,
  getById,
  deleteById,
  getAdjacentImages,
  ping,
  closeDb,
  testHelpers,
};
