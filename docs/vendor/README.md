# Vendored PDF rendering dependency

- **html2canvas 1.4.1**, Niklas von Hertzen, MIT.
- Source: https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
- Project: https://github.com/niklasvh/html2canvas
- License: `html2canvas-LICENSE.txt`.

The script is served locally; PDF export does not upload board content or load a renderer from a third-party CDN at runtime. The small JPEG-to-PDF wrapper in `pdf-export.js` is authored for Orbit.

## Account authentication dependency

- **@supabase/supabase-js 2.119.0**, Supabase, MIT.
- Official UMD bundle served locally as `supabase.js`.
- Source and SHA-256: `supabase-PROVENANCE.txt`.
- License: `supabase-LICENSE.txt`.

The SDK contacts only the configured Supabase project when account authentication is enabled. Public project connection settings are stored in `auth-config.js`; no server secrets are included.

## Document preview dependency

- **fflate 0.8.2**, Arjun Barrett, MIT. Loaded locally only when opening modern Office/OpenDocument archives.
- Source: https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
- SHA-256: `c3b34f2e9f5e74d4d7d64e01cac7a0c01954c6c406414d42185c7b53d6875ddf`.
- License: `fflate-LICENSE.txt`.
- Only selected XML entries are decompressed, with per-entry and total size limits. No document content is sent to a conversion service.

## PDF attachment viewer

- **pdfjs-dist 4.10.38**, Mozilla Foundation, Apache-2.0. Local ES module and worker, loaded only for PDF previews.
- Sources: https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs and https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs
- SHA-256 module: `44ec6f011027ee77791386b66c14876a5fc29e20bf0433c07c6726fff7212b72`
- SHA-256 worker: `bd88805178a26c729db8c0107a5b630cb900ec070f4d8c7529a3e45530afd41d`
- License: `pdfjs-LICENSE.txt`. JavaScript eval is disabled when loading PDFs. Documents are not sent to an external renderer.
