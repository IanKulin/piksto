# FEAT: Shared Collections

Let the owner share a collection with anonymous (not logged in) visitors via an unguessable link, with a mandatory expiry and an optional password. Visitors get a simplified, read-only view.

## Decisions

- Public URL prefix is `/share/:token`.
- Multiple shares per collection, each with its own expiry, password and metadata setting. No editing: to change anything, revoke and create a new share.
- **Expiry is mandatory**, chosen from presets only: 1 hour, 1 day, 7 days, 14 days. There is no "never". Computed on the server in UTC.
- **Password** is optional. A correct password unlocks that share for the rest of the visitor's browser session (the session cookie has no `maxAge`) or until the share expires, whichever comes first. There is no separate unlock timer.
- **Token storage is hash only.** The link is shown once, immediately after creation. Lost links are revoked and re-created.
- **Metadata:** each share has a "Strip metadata (EXIF)" option, **checked by default**. When on, every full-size response for that share is stripped.
- **Downloads:** visitors save images from the full-size view (browser save / long-press). There is no separate download route or button; the full-size response is already the stripped (or original) file.
- **The shared page shows the collection's existing title.** No comments, dates, source URLs or other metadata.
- **Visitor view:** a thumbnail grid; clicking a thumbnail opens the full image directly in the same tab (so the back button returns to the grid). No per-image detail page, no Prev/Next.
- **Views are logged** at `info` level.
- **Share links** are built from the request (`req.protocol` + `req.get("host")`), which is correct behind a proxy when `TRUST_PROXY` is set. There is no `PUBLIC_BASE_URL`.
- **Three header variants:** the authenticated header (nav, user menu, tab bar), and a bare public header used by the login page, share pages and any error page shown to a non-authenticated request.

## What we found in the codebase

### Schema (`src/db/connection.js`)

- `images`: encrypted BLOB columns for image, thumb, source URL (`url_data`) and comment (`comment_data`). Plaintext columns are only `mime_type` and `created_at`.
- `collections`: name and slug are encrypted; `collectionsCache` in `src/db/collections.js` holds the decrypted copies in memory. The cache is looked up by slug only today; there is no lookup by id.
- `image_collections`: join table, both FKs `ON DELETE CASCADE`. `foreign_keys = ON` is set, so a new `shares` table with `ON DELETE CASCADE` on `collection_id` cleans up when a collection is deleted.
- Schema is created with `CREATE TABLE IF NOT EXISTS` in one `db.exec` block. There is no migration framework, so the new table is just added to that block (safe for existing databases).

### Metadata audit

| Data                               | Stored?                                                 | Exposed to share visitors?                                             |
| ---------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Comment                            | Yes (encrypted)                                         | No, never rendered or returned by share routes                         |
| Source URL                         | Yes (encrypted, URL uploads only)                       | No                                                                     |
| `created_at`                       | Yes                                                     | No (omit from share views, including the `<time>` element in the grid) |
| Collection name                    | Yes (encrypted)                                         | Yes, as the page title (decided)                                       |
| Filenames                          | **Not stored.** Uploads only keep the buffer.           | n/a                                                                    |
| **EXIF in the original image**     | **Yes, untouched.** Originals are stored byte-for-byte. | **Yes unless the share has "strip metadata" on**                       |
| EXIF in thumbnails                 | No. `sharp(...).jpeg()` drops metadata by default.      | No                                                                     |
| EXIF after WebP to JPEG conversion | No (same reason)                                        | No                                                                     |

A JPEG from a phone usually carries GPS coordinates, device model and timestamps. That's fine today because only the owner sees originals; a public share changes that, hence the per-share strip option.

### Routes, middleware and views (`app.js`, `views/`)

- `requireAuth` is applied per-mount (`app.use("/image", requireAuth, imageRouter)`), not globally. A new public router can be mounted with no auth, and nothing authenticated leaks by accident.
- The existing `/image/:id*` routes serve any image ID to any logged-in user, so they can't be reused. Share routes check collection membership.
- `express-session` is configured with `saveUninitialized: false`, so anonymous visitors don't create rows in `sessions.db` unless we write to `req.session`.
- CSP forbids inline scripts, so the share-management UI JS must live under `public/`. The public pages need no JS at all.
- **Header problem (existing):** `views/_header.ejs` renders the full nav (Upload / All Images / Collections) unconditionally; only the user menu and tab bar are gated on `locals.user`. So `login.ejs` shows the authenticated nav to logged-out users, and so does `error.ejs` (which also links to `/`). `res.locals.user` is only set inside `requireAuth`, so the global 404/500 handlers in `app.js` render the full nav for anonymous requests too.
- `Referrer-Policy: same-origin` and `<meta name="robots" content="noindex">` already exist. We'll add `X-Robots-Tag: noindex` on share responses too.
- `.env.example` sets `LOG_LEVEL=warn`, so `info`-level view logging is silent in that configuration. See "Logging".

## Design

### Data model

New table in `src/db/connection.js`:

```sql
CREATE TABLE IF NOT EXISTS shares (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id  INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  token_hash     TEXT    NOT NULL UNIQUE,   -- sha256(token), hex; the token itself is never stored
  password_hash  TEXT,                      -- bcrypt; NULL = no password
  strip_metadata INTEGER NOT NULL DEFAULT 1,
  expires_at     TEXT    NOT NULL,          -- ISO-8601 UTC
  created_at     DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shares_collection_id ON shares(collection_id);
```

- **Token:** `crypto.randomBytes(32).toString("base64url")` (256 bits, 43 characters).
- **Lookup:** by `sha256(token)`. The token has full entropy, so a plain hash is fine and a direct indexed lookup is cheap. No slow hash needed.
- **Revoking** deletes the row. There's no `revoked` flag, so revoked, expired and nonexistent tokens all behave identically to visitors.
- Expiry is stored as ISO UTC and compared in JS (`Date.now() > Date.parse(expires_at)`). The `datetime('now')` format used elsewhere is `YYYY-MM-DD HH:MM:SS` and isn't lexically comparable with ISO strings, so don't mix the two.
- **Expired rows are not purged.** Enforcement is at read time, so leftover rows are harmless; the owner sees them marked "Expired" and can remove them, and they cascade away with the collection. No cleanup timer.

### DB modules

`src/db/shares.js` (re-exported from `src/db/index.js`):

- `createShare({ collectionId, tokenHash, passwordHash, stripMetadata, expiresAt })` returns the new row ID.
- `getShareByTokenHash(hash)` returns the row or `undefined`.
- `getSharesForCollection(collectionId)` returns **all** shares (including expired): `id`, `password_hash IS NOT NULL AS has_password`, `strip_metadata`, `expires_at`, `created_at`.
- `deleteShareById(id, collectionId)`. Including `collectionId` stops the owner's UI deleting a share belonging to another collection via a tampered ID.
- `isImageInCollection(imageId, collectionId)` is a single prepared statement on `image_collections`. It's used by every public image route.

`src/db/collections.js` additions (also re-exported):

- `getCollectionById(id)`: a lookup in `collectionsCache`, mirroring `getCollectionBySlug`.
- `getImagesByCollectionId(collectionId)`: exposes the existing prepared statement (currently only reachable via slug). Share views only use `id` from the result.

### Service: `src/shareService.js`

Mirrors `imageService.js`, keeping crypto and hashing out of the routes:

- `createShare(collection, { password, expiryPreset, stripMetadata })` validates the preset against `{ "1h", "1d", "7d", "14d" }`, generates the token, hashes it, bcrypt-hashes the password (cost 10, same as login) and returns `{ id, token }`. The token exists only in this return value.
- `resolveShare(token)` returns `{ share, collection }`, or `null` when the token is unknown, expired, or the collection is gone. Callers can't tell these apart.
- `verifyPassword(share, candidate)` uses `bcrypt.compare`.
- `stripImageMetadata(buffer)`:
  - Reads `sharp(buffer).metadata()` first. If the image is animated (`pages > 1`) or a GIF, return the buffer **unchanged** (sharp would otherwise flatten it to one frame).
  - Otherwise `sharp(buffer).rotate()` re-encoded in the same format. `.rotate()` applies the EXIF orientation first so images don't appear sideways; with no `.withMetadata()`, sharp drops EXIF/GPS on output. JPEG output uses a high quality (95) because sharp's default of 80 would visibly recompress shared photos.
  - Served bytes are therefore not byte-identical to the stored original.

### Public routes: `src/routes/share.js`, mounted at `/share` with no `requireAuth`

| Route                                   | Behaviour                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /share/:token`                     | Resolve share. If a password is set and the session isn't unlocked for this share, render the password form. Otherwise render the read-only grid.                                                                                                                                                  |
| `POST /share/:token/unlock`             | Rate-limited. Verify the password, record the unlock in the session, redirect to `/share/:token`. On failure, re-render the form with a generic error (status 401).                                                                                                                                |
| `GET /share/:token/image/:id/thumb.jpg` | Thumbnail.                                                                                                                                                                                                                                                                                         |
| `GET /share/:token/image/:id`           | Full image (stripped if `strip_metadata`). Thumbnails link here directly, opening in the same tab. Sets `Content-Type` from the row and `Content-Disposition: inline; filename="photo-<id>.<ext>"` (ext via `MIME_TO_EXT`), so no extension is needed in the URL and saving gives a sensible name. |

Every route runs one shared middleware, `loadShare`:

1. `resolveShare(req.params.token)`. On null, render `share-not-found` with status 404. Expired, revoked and unknown tokens look the same.
2. If the share has a password and `req.session.shareUnlocks?.[share.id]` isn't set, the grid route renders the password form; asset routes return a bare 401 with no body, so `<img>` tags just fail.
3. For `:id` routes, 404 unless `isImageInCollection(id, share.collection_id)`.
4. Set `X-Robots-Tag: noindex, nofollow` and attach `req.share` and `req.collection`.

The router also has its own error handler (and a catch-all for unmatched `/share/*` paths) that renders `share-not-found` / a generic public error with the public header, so a failure on a share route never falls through to the global handlers that render the authenticated error page.

Image handling reuses `getImage` / `getThumb` from `imageService.js`; share routes never read or return the comment or URL fields. Response headers differ from the authenticated routes:

- `Cache-Control: private, max-age=300`, **not** the 1-year `immutable` used for owner thumbnails. Revocation and expiry are only meaningful if browsers don't hold the image for a year.
- **No ETag / `If-None-Match` handling** on share routes, so the share and membership checks always run. Image responses use `res.end(buffer)` rather than `res.send`, because `send` adds an ETag automatically.

### Password unlock state

- Stored in the existing session: `req.session.shareUnlocks = { [shareId]: true }`. This reuses the signed cookie and `SqliteStore` already in place and avoids adding `cookie-parser`.
- The session is written only after a correct password, so unprotected shares and failed attempts create no session rows.
- No TTL. An unlock can never outlast its share, because `resolveShare` runs on every request and returns null once the share has expired or been revoked. Share IDs are `AUTOINCREMENT` and never reused, so a stale entry can't unlock a different share.
- Keying by share ID means an unlock for one link doesn't unlock another.
- The session cookie is `sameSite: "strict"`, so following the link from an external site (email, chat) doesn't send the cookie on that first navigation and a returning visitor re-enters the password. It works normally once on the page. Acceptable, and avoids loosening cookie settings for the owner's session.

### Rate limiting

Using `express-rate-limit` as elsewhere, with hardcoded constants (as login does), no new env vars:

- All `/share/*` routes: 600 requests/minute per IP. A grid of thumbnails makes many requests, and several visitors may share a NAT. It also acts as a CPU guard, since each thumbnail request decrypts a blob and each stripped full image re-encodes one.
- `POST /share/:token/unlock`: 10 attempts per 15 minutes, keyed by IP plus token (use `ipKeyGenerator` from express-rate-limit v8 for IPv6 safety), with `skipSuccessfulRequests: true` so correct passwords don't use up the budget. One visitor can't lock out everyone else, and one IP can't spread guesses across tokens.
- **Behind a reverse proxy `TRUST_PROXY` must be set**, otherwise every visitor appears to come from the proxy's IP, the limits are shared by everyone and the IPs in the logs are useless. Note this in `.env.example`.

### Owner management UI

On `views/collection-detail.ejs`:

- A "Share" button in the toolbar opens a modal (same markup as the existing `remove-modal`).
- The modal lists **all** of the collection's shares: created time, expiry (with an "Expired" label where past), "Password protected" badge, "Metadata stripped" badge, and a Stop sharing button (which also clears out expired rows). There is no link or copy button for existing shares because the token isn't stored.
- The create form has: optional password, expiry preset dropdown (1 hour / 1 day / 7 days / 14 days, default 1 day), and a "Strip metadata (EXIF)" checkbox, checked by default. An invalid preset re-renders with a banner error.
- After creating, the page re-renders with the modal open and a one-time panel showing the full link and a Copy button, with the text "This link won't be shown again." Because there's no flash-message library, the new token is carried in the response of the POST itself (render, don't redirect) so it never goes into a URL or the session. Copy uses `navigator.clipboard` (needs HTTPS or localhost; production already assumes HTTPS) with a select-the-text fallback.
- Because that render happens at `/collections/:slug/shares`, check that `collection-detail.ejs` uses only absolute paths for links, form actions and scripts.
- Browser reload after creating re-submits the POST. To avoid duplicate shares, the create form is disabled via JS after the first submit.
- JS in a new `public/share-modal.js`, loaded with `<script src defer>`. Wrapped in an IIFE because the page's other classic scripts declare top-level `const`s (e.g. `closeBtn`) in the same global scope.

Authenticated routes added to `src/routes/collections.js`:

- `POST /collections/:slug/shares` creates a share and renders `collection-detail` with `newShareUrl`.
- `POST /collections/:slug/shares/:id/delete` revokes a share and redirects to the collection with the modal open.
- The collection detail route passes `shares` to the view.

Link base URL: `${req.protocol}://${req.get("host")}/share/${token}`.

### Headers and public views

Split the current header into three pieces:

- `views/_head.ejs`: the shared `<head>` contents and opening `<body>` (charset, viewport, color-scheme, `noindex`, title from `pageTitle`, `topScriptUrl`, favicons, CSS). Extracted from today's `_header.ejs`.
- `views/_header.ejs`: **authenticated** chrome only. Includes `_head`, then the site header with nav, user menu, profile panel, bottom tab bar and the opening `<main>`. The `locals.user` guards inside it become unnecessary and are removed; every caller is behind `requireAuth`.
- `views/_header-public.ejs`: **unauthenticated** chrome. Includes `_head`, then a bare header with the "piksto" wordmark that is _not_ a link, no nav, no user menu, no tab bar, and the opening `<main>` (accepts `mainClass`).

Who uses which:

| View                                                     | Header                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `login.ejs`                                              | `_header-public` (fixes the existing nav-on-login oddity)                                                                      |
| `share.ejs`, `share-password.ejs`, `share-not-found.ejs` | `_header-public`                                                                                                               |
| `error.ejs`                                              | `_header` when the request is authenticated, otherwise `_header-public`. Chosen by an `isPublic` local passed by the renderer. |
| all other existing views                                 | `_header` (unchanged)                                                                                                          |

For `error.ejs`, the global 404 and 500 handlers in `app.js` pass `isPublic: !req.session?.authenticated` (they can't rely on `res.locals.user`, which is only set inside `requireAuth`). When public, the "Go home" link points to `/login` instead of `/`. Share routes render `share-not-found` instead of `error.ejs`, so they never hit this.

Public views (no JS on any of them):

- `views/share.ejs`: collection name as the title, image count, thumbnail grid. Each thumbnail links to `/share/:token/image/:id` (same tab, no `target`). Uses plain `<main>` (not `main--gallery`, which removes the side padding). Reuses `photo-grid` / `image-card` CSS classes; omits the select checkboxes, the `<time>` element, and the Select button. Image IDs come from `getImagesByCollectionId`; no mime lookup needed in the view.
- `views/share-password.ejs`: single password field plus submit.
- `views/share-not-found.ejs`: generic "This link isn't available." No link to `/`.

### Logging

`logger.info` calls (never log the token, only the share ID):

- `Share viewed: shareId=%s collection=%s ip=%s` on `GET /share/:token` once access is granted (not per thumbnail).
- `Share image opened: shareId=%s imageId=%s ip=%s` on the full-image route.
- `Share unlocked: shareId=%s ip=%s`, plus `logger.warn` for `Share unlock failed: shareId=%s ip=%s`.
- Share created and revoked: `shareId`, collection slug, expiry, `hasPassword`, `stripMetadata`.

`.env.example` ships `LOG_LEVEL=warn`, which hides all the `info` lines. Note in `.env.example` that `LOG_LEVEL=info` is needed to see view logs.

### Config additions (`.env.example`)

No new variables. Add comments only:

- `TRUST_PROXY` is required behind a reverse proxy for correct share rate limiting, IP logging and link generation.
- `LOG_LEVEL=info` is needed to see share view logs.

## Implementation steps

1. **DB:** add the `shares` table to `connection.js`; create `src/db/shares.js`; add `getCollectionById` and `getImagesByCollectionId` to `src/db/collections.js`; export from `src/db/index.js`. Unit tests in `test/unit/shares.test.js`: create, lookup by hash, per-collection list (includes expired), cascade on collection delete, `isImageInCollection`.
2. **Service:** `src/shareService.js` with token generation, hashing, preset validation, password verify, `resolveShare`, `stripImageMetadata`. Unit tests: expired returns null, unknown returns null, invalid preset rejected, token never persisted (the DB row contains only its hash), wrong/right password, stripped JPEG has no EXIF (generate the fixture with sharp's `withExif`; read back with `sharp().metadata()`) and orientation is applied, animated/GIF input is returned unchanged.
3. **Header split:** extract `_head.ejs`; make `_header.ejs` authenticated-only; add `_header-public.ejs`; switch `login.ejs` to it; update `error.ejs` and the global 404/500 handlers in `app.js` to pass `isPublic`. Verify every existing view still renders (existing e2e suite covers this).
4. **Public router:** `src/routes/share.js` with `loadShare`, unlock, rate limiters, asset routes, and its own error handler and catch-all. Mount in `app.js` at `/share` with no `requireAuth`. It **must be mounted before** `app.use("/", requireAuth, uploadRouter)`, which matches every path and would otherwise redirect share requests to `/login`.
5. **Public views and CSS:** `share.ejs`, `share-password.ejs`, `share-not-found.ejs` and any small CSS additions (including the bare wordmark).
6. **Owner UI:** collection routes for create and revoke, the modal in `collection-detail.ejs`, `public/share-modal.js`.
7. **Logging and config:** `info` logs; `.env.example` comments, README and CHANGELOG updates.
8. **E2E tests** (`test/e2e/share.spec.js`), using a fresh context with no `storageState` for the logged-out visitor:
   - Create a share as the owner (capture the one-time link), open it logged out, see the collection name and grid with no comments, dates or nav.
   - The management list shows no link for existing shares; expired shares are listed with an "Expired" label.
   - Full-image and thumbnail routes return the image; an image not in the collection returns 404 (including after removal from the collection).
   - Strip on: the served image has no EXIF; strip off: EXIF is present.
   - Password share: grid hidden until the right password; wrong password shows an error; a thumbnail request without the unlock returns 401.
   - Expired share (insert a row with a past `expires_at` directly in the DB) shows the not-found page, identical to an unknown token.
   - Revoking a share makes the link 404 immediately; other shares on the same collection keep working.
   - Deleting the collection removes its shares.
   - Headers: the logged-out `/login` page and an unknown path (`/nope`) show no Upload / All Images / Collections nav; a logged-in 404 still shows it. Share pages and share error pages contain no link to `/`.
   - Authenticated routes (`/allimages`, `/image/:id`, `/collections`) still redirect a logged-out visitor to `/login`.
9. Run `npm run lint`, `npm run format`, `npm test`.

## Security checklist

- 256-bit random token; only its SHA-256 hash is stored, so a database leak yields no usable links.
- Unknown, expired and revoked shares return an identical 404.
- Every public image route verifies collection membership; no route accepts a bare image ID.
- Password stored as bcrypt; unlock held server-side in the session, keyed per share, never outlasting the share; unlock attempts rate-limited per IP+token.
- Share responses: `X-Robots-Tag: noindex`, `Cache-Control: private`, short max-age, no ETag. EXIF removed by default.
- No comments, source URLs, dates or filenames in any public response.
- Public pages (including share error pages, login and anonymous 404/500) contain no authenticated nav and no inline scripts (CSP unchanged).
- Anonymous visitors don't create session rows.
- Tokens never appear in logs (use the share ID) and never appear in a redirect URL or the session on the owner's side.
