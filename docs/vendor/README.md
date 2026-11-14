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

The SDK contacts only the configured Supabase project when account authentication is enabled. No project URL or key is included by default.
