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
NODE_PATH=/tmp/orbit-qa/node_modules node qa/integration-check.cjs
NODE_PATH=/tmp/orbit-qa/node_modules node qa/pdf-check.cjs
```

The PDF check also uses Python Pillow, pypdf and PyMuPDF (`fitz`), plus DejaVu Sans, to parse and rasterize a sample PDF. It checks geometry, crop preparation, UI interactions and PDF structure; actual browser/html2canvas visual rendering remains unverified. Authentication tests use a mocked Supabase SDK and send no real emails. Live registration requires the project configuration described in [AUTH_SETUP.md](../AUTH_SETUP.md).
