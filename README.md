# piksto

Piksto is self-hosted image storage web application. Images can be uploaded by file or URL, and sorted into 'Collections'.

## Deployment

Recommended deployment is by Docker. Here's a sample `docker-compose.yaml`

```yaml
services:
  piksto:
    image: ghcr.io/iankulin/piksto
    container_name: piksto
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      ENCRYPTION_KEY: <32 character random encryption key>
      SESSION_SECRET: <random string for the session secret>
      AUTH_USERNAME: admin
      AUTH_PASSWORD_HASH: <hash of admin password>
    restart: unless-stopped
```

Use the tool at [iankulin/github.io/crypt](https://iankulin/github.io/crypt) to generate the key and admin password hash.

Edit `.env` and set the required values if not specifying in the docker-compose:

| Variable                      | Required | Description                                                                                  |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`              | Yes      | 64-character hex string (32 bytes). Generate with `npm run generate-key`.                    |
| `SESSION_SECRET`              | Yes      | Random string for signing session cookies. Use at least 32 characters.                       |
| `AUTH_PASSWORD_HASH`          | Yes      | bcrypt hash of your login password. Generate with `npm run hash-password <password>`.        |
| `AUTH_USERNAME`               | No       | Login username. Defaults to `admin`.                                                         |
| `PORT`                        | No       | Port to listen on. Defaults to `3000`.                                                       |
| `LOG_LEVEL`                   | No       | Logging verbosity. Defaults to `info`.                                                       |
| `MAX_UPLOAD_MB`               | No       | Maximum upload size in megabytes (decimals allowed, e.g. `0.5`). Defaults to `2`.            |
| `UPLOAD_RATE_LIMIT_MAX`       | No       | Maximum uploads per IP per window. Defaults to `100`.                                        |
| `UPLOAD_RATE_LIMIT_WINDOW_MS` | No       | Rate limit window in milliseconds. Defaults to `60000` (1 minute).                           |
| `TRUST_PROXY`                 | No       | Set to `1` (or number of proxies) when running behind Nginx or similar. Defaults to `false`. |
| `SECURE_COOKIE`               | No       | Set to `true` in production to require HTTPS for session cookies. Defaults to `true`.        |
| `SESSION_IDLE_TIMEOUT_HOURS`  | No       | Hours of inactivity before a session is invalidated. Defaults to `24`.                       |

## Security

Images, thumbnails and Collection names are stored only as encrypted BLOBs in SQLite — never as files on disk. Each blob is encrypted independently with a fresh random IV. A single admin credential is set by an ENVIRONMENT variable. Requests are rate limited.

## License

GPL-3.0

## AI Disclosure

AI tools were used in the production of this app.

## Contributions

I'm not expecting any, feel free to fork and use in line with GPL3. A GitHub issue for any security issues would be appreciated.

## Development

```bash
npm run lint # Run lint
npm run format # Run formatter
npm test # Run all tests (unit + e2e)
node --test test/unit/crypto.test.js # Run a single unit test file
npx playwright test test/e2e/stage3.spec.js # Run a single e2e spec
```

E2e tests use Playwright (Chromium only, single worker to avoid SQLite race conditions). Playwright auto-starts the server if none is running, using a test encryption key.

## Architecture

```
app.js              Express app setup, session middleware, route mounting
server.js           HTTP listener, graceful shutdown

src/
  crypto.js         AES-256-GCM encrypt/decrypt
  db.js             Re-exports from src/db/ — single import point for routes
  db/
    connection.js   Opens and exports the better-sqlite3 connection
    images.js       Image CRUD queries
    collections.js  Collection CRUD queries and image↔collection joins
    migrate.js      Schema migrations (runs at startup)
    index.js        Re-exports all db functions
  sessionDb.js      SQLite — sessions database
  sessionStore.js   express-session store backed by sessionDb
  imageService.js   Orchestrates encrypt/decrypt and thumbnail generation
  thumbnail.js      Sharp — 300×300 JPEG thumbnail generation
  ssrfGuard.js      Blocks URL uploads to private/internal addresses
  mimeTypes.js      MIME type → file extension map
  slugify.js        Converts collection names to URL-safe slugs
  redirect.js       Safe redirect helper (validates paths before redirecting)
  logger.js         Structured logger (@iankulin/logger)
  middleware/
    requireAuth.js  Redirects unauthenticated requests to /login
  routes/
    auth.js         GET /login, POST /login, POST /logout
    health.js       GET /health (unauthenticated)
    upload.js       GET /, POST /upload/file, POST /upload/url
    allimages.js    GET /allimages, POST /allimages/delete
    image.js        GET /image/:id, GET /image/:id.:ext,
                    GET /image/:id/thumb.jpg, GET /image/:id/download,
                    POST /image/:id/delete
    collections.js  GET /collections, POST /collections, POST /collections/delete,
                    GET /collections/:slug, GET /collections/:slug/image/:id,
                    POST /collections/:slug/remove, POST /collections/:slug/delete
    api.js          GET /api/collections, GET /api/image/:id/collections,
                    POST /api/image/:id/collections/:collectionId/toggle

views/
  _header.ejs                  Shared page header partial
  _add-to-collection-modal.ejs Modal for adding an image to a collection
  login.ejs
  upload.ejs
  allimages.ejs
  image.ejs
  image-detail.ejs             Image detail view within a collection context
  collections.ejs              Collections list page
  collection-detail.ejs        Single collection page with its images
  error.ejs
```
