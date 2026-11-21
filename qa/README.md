# DOM workflow checks

These checks use jsdom and fake-indexeddb; neither is needed by the deployed app. Canvas drawing and dialog browser behavior are stubbed, so these checks do not replace visual browser QA.

Install test dependencies outside the checkout, then run:

```sh
npm install --prefix /tmp/orbit-qa jsdom fake-indexeddb --no-audit --no-fund
NODE_PATH=/tmp/orbit-qa/node_modules node qa/check.cjs
```

Feature checks with the same jsdom/fake-indexeddb dependencies:

```sh
NODE_PATH=/tmp/orbit-qa/node_modules node qa/accounts-check.cjs
NODE_PATH=/tmp/orbit-qa/node_modules node qa/auth-check.cjs
NODE_PATH=/tmp/orbit-qa/node_modules node qa/sync-check.cjs
NODE_PATH=/tmp/orbit-qa/node_modules node qa/integration-check.cjs
NODE_PATH=/tmp/orbit-qa/node_modules node qa/pdf-check.cjs
```

The PDF check also uses Python Pillow, pypdf and PyMuPDF (`fitz`), plus DejaVu Sans, to parse and rasterize a sample PDF. It checks geometry, crop preparation, UI interactions and PDF structure; actual browser/html2canvas visual rendering remains unverified. Authentication tests use a mocked Supabase SDK and send no real emails. Live registration requires the project configuration described in [AUTH_SETUP.md](../AUTH_SETUP.md).

Responsive interaction checks:

```sh
NODE_PATH=/tmp/orbit-qa/node_modules node qa/responsive-check.cjs
```

These use simulated viewport widths (320, 375, 768, 1024 and 1280), touch events and keyboard resizing. They check behavior and accessibility state, not browser layout or physical device rendering.

Cloud sync checks use a mocked Supabase client: create/load/save, attachments, offline retries, conflict protection and account switching. Live Auth, SQL/RLS and Storage need a configured Supabase project and must be verified using AUTH_SETUP.md.

SQL/RLS checks run against PostgreSQL in PGlite with minimal Auth/Storage fixtures (no live project):

```sh
npm install --prefix /tmp/orbit-qa @electric-sql/pglite --no-audit --no-fund
NODE_PATH=/tmp/orbit-qa/node_modules node qa/cloud-schema-check.cjs
```

## Attachment viewer in Chromium

Serve `docs/` locally, then run the Playwright test with Chromium installed:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs
node qa/file-viewer-browser.cjs
```

The test overrides Auth configuration and uses generated fixtures only. It checks visible images/zoom, Word text, Excel sheets, CSV quoting, inert HTML, corrupt-file downloads, PDF/media elements, unsupported formats, profile cleanup and a 375px mobile dialog. Screenshots are written to `/tmp/orbit-files-*.png`. The PDF fixture is rendered by the real PDF.js worker and its extracted text is checked. Media playback needs real valid files/codecs; generated audio/video fixtures only verify player routing. ODT/PPTX text and archive decompression limits are also checked.

## Shared board

```sh
NODE_PATH=/tmp/orbit-qa/node_modules node qa/shared-schema-check.cjs
node qa/shared-browser.cjs
```

The schema test uses PGlite with Auth/Storage fixtures and verifies author-only writes, shared reads, unpublished-file protection and preservation of private-workspace policies. The browser test uses two isolated Chromium profiles and a mocked service: shared notes/files, owner controls, private-workspace separation, refresh/delete, offline drafts and logout. Serve `docs/` on port 8765 first. Live schema/grants/bucket metadata is also checked after deployment; no existing user content is migrated.

## Theme and zoom

With the local docs server running on port 8765, run `node qa/comfort-browser.cjs`. It checks real Chromium dark/light text contrast, readable initial scale, absence of remote font requests, anchored zoom presets/range/keyboard, per-board view persistence across reloads, browser Ctrl-zoom preservation and mobile/landscape menu geometry. Screenshots are written to `/tmp/orbit-comfort-*.png`.
