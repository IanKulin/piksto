# photo-sink — Implementation Plan

Each stage ends with a testable milestone. Complete stages in order.

---

## Stage 1 — Project Scaffold & Server Startup

**Goal:** A running Express server with correct project structure, environment validation, and database initialization.

### Tasks

1. **Initialize npm project**
   - `npm init -y`
   - Install dependencies: `express`, `ejs`, `better-sqlite3`, `multer`, `sharp`, `dotenv`
   - Install dev dependencies: none required

2. **Create directory structure**
   ```
   data/
   public/
   views/
   src/
   src/routes/
   ```

3. **`src/db.js`** — Database module
   - Opens (or creates) `data/photosink.db`
   - Runs `CREATE TABLE IF NOT EXISTS images (...)` with the full schema from the spec
   - Exports the `db` instance and prepared statements for later use

4. **`src/crypto.js`** — Encryption helpers
   - `encrypt(buffer)` → `{ iv, ciphertext, authTag }` using AES-256-GCM
   - `decrypt({ iv, ciphertext, authTag })` → `Buffer`
   - Reads key from `process.env.ENCRYPTION_KEY`; throws on bad key

5. **`app.js`** — Express app setup
   - Load `dotenv`
   - Validate `ENCRYPTION_KEY` at startup (64 hex chars); throw and exit if invalid
   - Mount static files from `public/`
   - Set EJS as view engine, views dir to `views/`
   - Export the `app` instance

6. **`server.js`** — Entry point
   - Require `app.js`
   - Listen on `process.env.PORT || 3000`

7. **`.env.example`**
   ```
   ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
   MAX_UPLOAD_BYTES=2097152
   PORT=3000
   ```

8. **`.env`** (gitignored) — Copy from `.env.example` with a real 32-byte hex key for local dev

9. **`.gitignore`**
   ```
   node_modules/
   data/
   .env
   ```

### Test Checklist
- [ ] `node server.js` starts without errors
- [ ] Server prints listening message on correct port
- [ ] `data/photosink.db` is created on disk
- [ ] Starting without `ENCRYPTION_KEY` set crashes with a clear error message
- [ ] Starting with an invalid key (wrong length) also crashes with a clear error

---

## Stage 2 — Upload Page (UI Shell)

**Goal:** A styled, interactive upload page renders at `GET /` with drag-and-drop zone, file input, URL input, and success/error banners — no backend upload logic yet.

### Tasks

1. **`views/layout.ejs`** — Shared HTML shell
   - `<!DOCTYPE html>`, `<head>` with charset, viewport, `color-scheme` meta, link to `style.css`
   - Header with app name and nav link to `/gallery`
   - `<%- body %>` content slot
   - Footer

2. **`views/upload.ejs`**
   - Includes layout
   - Success banner (green): shown when `?success=1`
   - Error banner (red): shown when `?error=<message>` (URL-decode the message)
   - Drag-and-drop zone:
     - Large dashed border area
     - Label "Drop an image here"
     - `<input type="file" accept="image/*" name="image">` inside zone
     - Wraps a `<form method="POST" action="/upload/file" enctype="multipart/form-data">`
     - Submit button inside the form
   - URL section:
     - `<form method="POST" action="/upload/url">`
     - `<input type="text" name="url" placeholder="https://…">`
     - Submit ("Fetch") button

3. **`public/style.css`** — Full stylesheet
   - CSS custom properties for light/dark themes via `@media (prefers-color-scheme: dark)`
   - Base reset and typography
   - `.card` centred layout for upload page
   - Drag-and-drop zone styles (dashed border, highlight on dragover)
   - `.banner--success` and `.banner--error`
   - Gallery grid (for Stage 4)
   - Image detail styles (for Stage 5)
   - Button styles including `.btn--danger`
   - Responsive breakpoints

4. **`src/routes/upload.js`** — Stub
   - `GET /` handler: render `upload.ejs` passing `success` and `error` from query params
   - Export router (POST handlers are stubs that `res.redirect('/?error=Not+implemented')`)

5. **`app.js`** — Mount upload router at `/`

### Test Checklist
- [ ] `GET /` renders the upload page
- [ ] Drag-and-drop zone is visible with dashed border
- [ ] `?success=1` shows green banner
- [ ] `?error=Something+went+wrong` shows red banner with decoded message
- [ ] Page looks correct in light mode and dark mode (toggle OS preference)
- [ ] Page is usable on a narrow (mobile) viewport
- [ ] Nav link to `/gallery` is present in header

---

## Stage 3 — File Upload & Encryption Pipeline

**Goal:** Uploading an image via file or URL encrypts and stores it in the database. No gallery yet — just the redirect to `/?success=1`.

### Tasks

1. **`src/thumbnail.js`** — Thumbnail generation
   - `generateThumbnail(inputBuffer)` → `Buffer` (JPEG, 300×300 fit, quality 80)
   - Uses Sharp

2. **`src/routes/upload.js`** — Full implementation

   **`POST /upload/file`:**
   - Configure Multer: memory storage, field `image`, size limit from `MAX_UPLOAD_BYTES`
   - Validate MIME type against allowlist `['image/jpeg','image/png','image/gif','image/webp','image/avif']`
   - Generate thumbnail
   - Encrypt full image and thumbnail independently (two separate `encrypt()` calls, two random IVs)
   - Insert row into `images` (store iv, ciphertext, authTag as BLOBs for both image and thumb)
   - Redirect `/?success=1`
   - Error handling:
     - Multer size error → `/?error=File+too+large`
     - Invalid MIME → `/?error=Unsupported+image+type`
     - All others → `/?error=Upload+failed`

   **`POST /upload/url`:**
   - Parse `url` from body (`express.urlencoded`)
   - Validate it is `http://` or `https://`; if not → `/?error=Invalid+URL`
   - Fetch with native `fetch` (Node 18+) with a 10 s `AbortController` timeout
   - Check `Content-Length` header against `MAX_UPLOAD_BYTES`; abort if exceeded
   - Stream body into a Buffer; abort if running byte count exceeds limit
   - Validate `Content-Type` from response headers
   - Continue with thumbnail → encrypt → insert flow
   - Fetch error / timeout → `/?error=Could+not+fetch+image`

3. **`app.js`** — Add `express.urlencoded({ extended: false })` middleware

### Test Checklist
- [ ] Upload a JPEG via file input → redirects to `/?success=1`
- [ ] Upload a PNG via file input → success
- [ ] Upload a GIF via file input → success
- [ ] Upload a file >2 MB → `/?error=File+too+large`
- [ ] Upload a `.txt` file → `/?error=Unsupported+image+type`
- [ ] Paste a valid image URL → success
- [ ] Paste a non-image URL → `/?error=Unsupported+image+type`
- [ ] Paste a malformed URL (no scheme) → `/?error=Invalid+URL`
- [ ] Paste a URL that returns an image >2 MB → error
- [ ] Verify row inserted in DB via `sqlite3 data/photosink.db "SELECT id, mime_type, created_at FROM images;"`
- [ ] Verify `iv_image`, `image_data`, `auth_tag_image` columns are non-null BLOBs

---

## Stage 4 — Gallery Page

**Goal:** `GET /gallery` displays decrypted thumbnails in a grid.

### Tasks

1. **`views/gallery.ejs`**
   - Includes layout
   - CSS grid of thumbnail cards (`repeat(auto-fill, minmax(160px, 1fr))`)
   - Each card:
     - `<a href="/image/<%= img.id %>">` wrapping `<img src="<%= img.thumbDataUri %>">`
     - Upload date below image
   - Empty state message if no images

2. **`src/routes/gallery.js`**
   - `GET /gallery`:
     - Query all rows `ORDER BY created_at ASC`
     - For each row: decrypt `thumb_data` using stored `iv_thumb` and `auth_tag_thumb` → base64-encode → `data:image/jpeg;base64,…`
     - Render `gallery.ejs` with array of `{ id, created_at, thumbDataUri }`
     - Decryption failure → 500

3. **`views/error.ejs`**
   - Generic error page (used for 500s)
   - Shows a safe, user-facing message (no internal details)

4. **`app.js`** — Mount gallery router

### Test Checklist
- [ ] `GET /gallery` renders without error after uploading at least one image
- [ ] Thumbnails are visible in a grid layout
- [ ] Each card shows the upload date
- [ ] Clicking a card navigates to `/image/:id`
- [ ] Empty gallery shows a friendly message
- [ ] Gallery looks correct in light and dark mode
- [ ] Manually corrupt an auth tag in the DB → gallery returns 500 (or error page per row)

---

## Stage 5 — Image Detail, Download & Delete

**Goal:** Full image view with download and delete functionality.

### Tasks

1. **`views/image.ejs`**
   - Includes layout
   - Full-size image: `<img src="<%= imageDataUri %>" style="max-width:100%">`
   - Upload date
   - Download link: `<a href="/image/<%= id %>/download" download>Download</a>` (styled as button)
   - Delete form:
     ```html
     <form method="POST" action="/image/<%= id %>/delete">
       <button type="submit" class="btn btn--danger">Delete</button>
     </form>
     ```
   - Back to Gallery link

2. **`src/routes/image.js`**

   **`GET /image/:id`:**
   - Fetch row by id; 404 if not found
   - Decrypt `image_data` → base64 → `data:<mime_type>;base64,…`
   - Render `image.ejs` with `{ id, mime_type, created_at, imageDataUri }`

   **`GET /image/:id/download`:**
   - Fetch row by id; 404 if not found
   - Decrypt `image_data`
   - Derive extension from MIME type (`image/jpeg` → `jpg`, `image/png` → `png`, etc.)
   - Set `Content-Type` to `mime_type`
   - Set `Content-Disposition: attachment; filename="photo-<id>.<ext>"`
   - Send decrypted buffer

   **`POST /image/:id/delete`:**
   - Delete row by id
   - Redirect to `/gallery`

3. **`app.js`** — Mount image router

4. **Wire up 404 handler** in `app.js` for unknown routes

### Test Checklist
- [ ] Click a gallery thumbnail → full-size image renders on detail page
- [ ] Upload date and image ID are displayed
- [ ] Download button triggers browser download with correct filename (e.g. `photo-3.jpg`)
- [ ] Downloaded file opens correctly in an image viewer
- [ ] Delete button removes the image → redirected to `/gallery`, image no longer appears
- [ ] `GET /image/9999` → 404 response
- [ ] Back to Gallery link works
- [ ] Detail page looks correct in light and dark mode

---

## Stage 6 — Drag-and-Drop JavaScript & Polish

**Goal:** JavaScript enhances the drag-and-drop zone; final UI and error-handling polish.

### Tasks

1. **`public/style.css`** — Drag-over highlight state (`.drop-zone--active`)

2. **`public/upload.js`** (or inline `<script>` in `upload.ejs`)
   - Listen for `dragover` on the drop zone → add `.drop-zone--active`, `preventDefault()`
   - Listen for `dragleave` → remove `.drop-zone--active`
   - Listen for `drop` → remove `.drop-zone--active`, set `input.files = event.dataTransfer.files`, submit the form

3. **Final error handling audit**
   - Ensure all error paths in routes use the correct redirect format
   - Ensure `views/error.ejs` is rendered for unhandled 500s (add `app.use` error middleware in `app.js`)
   - Ensure 404 handler is in place

4. **`package.json`** — Add `"start": "node server.js"` script

### Test Checklist
- [ ] Drag an image file onto the drop zone → zone highlights on hover, form submits on drop
- [ ] Drag a non-image file → rejected with `/?error=Unsupported+image+type` (handled server-side; drag still submits)
- [ ] Drop multiple files → only first is submitted (Multer single-field)
- [ ] All previously passing tests from Stages 1–5 still pass
- [ ] `npm start` starts the server correctly

---

## Dependency Reference

```json
{
  "dependencies": {
    "better-sqlite3": "^9.x",
    "dotenv": "^16.x",
    "ejs": "^3.x",
    "express": "^4.x",
    "multer": "^1.x",
    "sharp": "^0.33.x"
  }
}
```

> Node 18+ is required for native `fetch` support used in the URL upload flow.

---

## Implementation Order Summary

| Stage | Deliverable | End State |
|---|---|---|
| 1 | Scaffold + DB + Crypto + Server | Server boots, DB created, key validated |
| 2 | Upload page UI (no backend) | Styled upload page renders with banners |
| 3 | File & URL upload pipeline | Images stored encrypted in DB |
| 4 | Gallery page | Thumbnails visible in grid |
| 5 | Image detail, download, delete | Full CRUD flow complete |
| 6 | Drag-and-drop JS + polish | Production-ready UX |
