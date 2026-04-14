# photo-sink — Application Specification

## Overview

A lightweight web app for storing and viewing digital photos and images. Images are uploaded via drag-and-drop or URL, stored encrypted in a SQLite database, and viewable through a simple gallery interface. Authentication is handled at the reverse-proxy layer (NGINX Basic Auth) — the app itself has no auth logic.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| Templating | EJS |
| Database | SQLite via `better-sqlite3` |
| File uploads | Multer |
| Image processing | Sharp (thumbnails) |
| Encryption | Node.js built-in `crypto` (AES-256-GCM) |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ENCRYPTION_KEY` | Yes | — | 32-byte hex string used as the AES-256-GCM encryption key |
| `MAX_UPLOAD_BYTES` | No | `2097152` (2 MB) | Maximum size in bytes for uploaded images and URL-fetched images |
| `PORT` | No | `3000` | Port the Express server listens on |

---

## Database Schema

Single SQLite file (e.g. `data/photosink.db`).

```sql
CREATE TABLE images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mime_type   TEXT    NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
  iv_image    BLOB    NOT NULL,   -- 12-byte GCM IV for the full image
  image_data  BLOB    NOT NULL,   -- AES-256-GCM encrypted image bytes
  iv_thumb    BLOB    NOT NULL,   -- 12-byte GCM IV for the thumbnail
  thumb_data  BLOB    NOT NULL,   -- AES-256-GCM encrypted thumbnail bytes
  auth_tag_image BLOB NOT NULL,   -- 16-byte GCM auth tag for image
  auth_tag_thumb BLOB NOT NULL    -- 16-byte GCM auth tag for thumbnail
);
```

---

## Encryption

- Algorithm: **AES-256-GCM**
- Key: derived from `ENCRYPTION_KEY` env var. The raw hex value is decoded to a 32-byte Buffer. The app should fail to start if the key is missing or not exactly 64 hex characters.
- Each blob (image and thumbnail) is encrypted independently with a freshly generated 12-byte random IV.
- The IV and GCM auth tag are stored alongside the ciphertext in separate columns.
- Decryption verifies the auth tag; if verification fails the request returns a 500 error.

---

## Thumbnail Generation

- Produced server-side at upload time using **Sharp**.
- Resized to fit within **300 × 300 px**, preserving aspect ratio (longest side = 300 px).
- Output format: JPEG (quality 80), regardless of source format.
- Encrypted and stored in `thumb_data` alongside the full image.

---

## Accepted Image Formats

Any image format that:
1. Web browsers can display natively, **and**
2. Sharp can process for thumbnail generation.

In practice: JPEG, PNG, GIF, WebP, AVIF, TIFF, SVG (passthrough; Sharp may not resize SVG — treat as unsupported for thumbnails and reject).

Validation: check the `Content-Type` / detected MIME type against an allowlist:
`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`.

---

## Routes

### Upload Page — `GET /`

- **Access:** Public (unprotected)
- **Template:** `views/upload.ejs`
- Renders the upload interface.
- Accepts an optional `?success=1` query param to show a success banner.
- Accepts an optional `?error=<message>` query param to show an error banner.

---

### Upload via File — `POST /upload/file`

- **Access:** Public
- **Middleware:** Multer (memory storage, field name `image`, size limit from `MAX_UPLOAD_BYTES`)
- **Flow:**
  1. Validate MIME type is in the allowlist. If not → redirect `/?error=Unsupported+image+type`.
  2. Validate file size ≤ `MAX_UPLOAD_BYTES`. If exceeded, Multer will reject with an error → redirect `/?error=File+too+large`.
  3. Generate thumbnail via Sharp.
  4. Encrypt image bytes and thumbnail bytes independently.
  5. Insert row into `images`.
  6. Redirect to `/?success=1`.
- On any unexpected error → redirect `/?error=Upload+failed`.

---

### Upload via URL — `POST /upload/url`

- **Access:** Public
- **Flow:**
  1. Parse `url` from request body.
  2. Validate it is a well-formed `http` or `https` URL. If not → redirect `/?error=Invalid+URL`.
  3. Fetch the URL server-side with a streaming HTTP client (e.g. `node-fetch` or native `fetch`). Abort if response `Content-Length` exceeds `MAX_UPLOAD_BYTES`, or if the streamed byte count exceeds the limit.
  4. Validate the `Content-Type` response header is in the allowlist.
  5. Continue from step 3 of the file upload flow above.
- On fetch failure → redirect `/?error=Could+not+fetch+image`.

---

### Gallery — `GET /gallery`

- **Access:** Protected (NGINX Basic Auth — app applies no auth check)
- **Template:** `views/gallery.ejs`
- Queries all rows from `images` ordered by `created_at ASC` (insertion order).
- For each image, decrypts `thumb_data` and base64-encodes it for inline rendering (`data:image/jpeg;base64,...`).
- Passes an array of `{ id, created_at, thumbDataUri }` to the template.
- Thumbnails link to `/image/:id`.

---

### Image Detail — `GET /image/:id`

- **Template:** `views/image.ejs`
- Fetches the row by `id`.
- Decrypts `image_data`, base64-encodes for inline rendering.
- Passes `{ id, mime_type, created_at, imageDataUri }` to the template.
- Page shows:
  - The full-size image
  - A **Download** link (triggers browser download; see below)
  - A **Delete** button (POST form to `/image/:id/delete`)
  - A **Back to Gallery** link

---

### Image Download — `GET /image/:id/download`

- Fetches and decrypts `image_data`.
- Responds with the raw decrypted bytes.
- Sets `Content-Type` to the stored `mime_type`.
- Sets `Content-Disposition: attachment; filename="photo-<id>.<ext>"` where `<ext>` is derived from the MIME type.

---

### Image Delete — `POST /image/:id/delete`

- Deletes the row from `images`.
- Redirects to `/gallery`.

---

## UI & Design

- Clean, minimal, modern aesthetic.
- Respects the browser's `prefers-color-scheme` (light/dark mode) via CSS `@media (prefers-color-scheme: dark)` or the `color-scheme` meta tag — **no JavaScript toggle required**.
- No external CSS frameworks; plain CSS in a single `public/style.css`.
- Responsive layout — usable on mobile.

### Upload Page (`/`)

- Centred card layout.
- **Drag-and-drop zone**: large dashed-border area with label "Drop an image here". On drag-over, the border highlights. On drop, the file is submitted via the file upload form.
- **File input**: a standard `<input type="file" accept="image/*">` within the drag-and-drop zone as a fallback.
- **URL input**: a separate section below the drop zone with a text input and a "Fetch" button.
- Success banner (green) and error banner (red) rendered conditionally from query params.
- A discreet link to `/gallery` in the page footer or header.

### Gallery Page (`/gallery`)

- CSS grid of thumbnail cards, auto-filling columns (e.g. `repeat(auto-fill, minmax(160px, 1fr))`).
- Each card: thumbnail image + upload date below it.
- Cards are links to the image detail page.

### Image Detail Page (`/image/:id`)

- Full-width image (max-width constrained, centred).
- Upload date displayed.
- Download and Delete actions presented as clearly labelled buttons.
- Delete button is styled distinctively (e.g. red/destructive) and uses a `<form method="POST">` — no JavaScript required.

---

## Project Structure

```
photo-sink/
├── data/                  # SQLite DB (gitignored)
├── public/
│   └── style.css
├── views/
│   ├── layout.ejs         # Shared HTML shell (head, nav, footer)
│   ├── upload.ejs
│   ├── gallery.ejs
│   └── image.ejs
├── src/
│   ├── db.js              # Database initialisation and prepared statements
│   ├── crypto.js          # encrypt / decrypt helpers
│   ├── thumbnail.js       # Sharp thumbnail generation
│   └── routes/
│       ├── upload.js
│       ├── gallery.js
│       └── image.js
├── app.js                 # Express app setup
├── server.js              # Entry point (binds port)
├── .env.example
└── package.json
```

---

## Error Handling & Edge Cases

- App refuses to start if `ENCRYPTION_KEY` is missing or invalid.
- Multer size limit errors are caught and result in a user-friendly redirect.
- All database and decryption errors return a 500 page (template: `views/error.ejs`) with a generic message — no internal details exposed.
- Requests for non-existent image IDs return 404.
- URL fetch requests that time out (suggest 10 s timeout) redirect with an error message.

---

## Out of Scope (for now)

- User accounts or per-user image ownership
- Image tagging, search, or sorting controls
- Pagination of the gallery
- EXIF data extraction or display
- Video or non-image file support
