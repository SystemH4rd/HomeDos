# DOM workflow checks

These checks use jsdom and fake-indexeddb; neither is needed by the deployed app. Canvas drawing and dialog browser behavior are stubbed, so these checks do not replace visual browser QA.

Install test dependencies outside the checkout, then run:

```sh
npm install --prefix /tmp/orbit-qa jsdom fake-indexeddb --no-audit --no-fund
NODE_PATH=/tmp/orbit-qa/node_modules node qa/check.cjs
```
