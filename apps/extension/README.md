# Browser Extension V1

This package contains the Chromium Manifest V3 extension for annotating Polymarket `Top Holders` rows with internal wallet labels.

## Build

```bash
npm run build -w apps/extension
```

The unpacked extension output will be written to `apps/extension/dist`.

## Configure

1. Load `apps/extension/dist` as an unpacked extension in Chrome or Edge.
2. Open the popup and set:
   - `Backend URL`: your running `apps/web` origin, for example `http://localhost:3000`
   - `Read-only Token`: optional `EXTENSION_READ_ONLY_TOKEN` if your environment requires it
3. Visit a Polymarket market page and wait for the extension to annotate the `Top Holders` section.

## APIs Used

- `GET /api/extension/market-annotations?slug=<marketSlug>`
- `POST /api/extension/labels/lookup`
