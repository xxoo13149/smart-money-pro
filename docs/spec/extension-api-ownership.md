# Extension API Ownership

## Decision

Production extension traffic should use the public Worker at `PUBLIC_EXTENSION_BASE_URL`.
The Worker owns `/api/extension/*` auth, session refresh, label lookup, market annotations,
search, and health reporting.

The Next.js web app may keep `/api/extension/*` routes for local development and legacy
read-only fallback, but production release builds should point the extension runtime config
at the Worker.

## Compatibility Rules

- Do not remove web-side extension routes without first proving release runtime config uses the Worker.
- Preserve existing response shapes for `search`, `labels/lookup`, and `market-annotations`.
- Add validation and request-size limits on both surfaces while both are present.
- Contract tests should cover 401, invalid payload, empty results, cache headers, and 304 behavior.

## Current Owner Matrix

| Route | Production owner | Web fallback |
| --- | --- | --- |
| `/api/extension/auth/exchange` | Worker | Dev/legacy only |
| `/api/extension/auth/login` | Worker | Dev/legacy only |
| `/api/extension/auth/register` | Worker | Dev/legacy only |
| `/api/extension/auth/refresh` | Worker | Dev/legacy only |
| `/api/extension/auth/logout` | Worker | Dev/legacy only |
| `/api/extension/labels/lookup` | Worker | Read-only fallback |
| `/api/extension/market-annotations` | Worker | Read-only fallback |
| `/api/extension/search` | Worker | Read-only fallback |
| `/api/extension/health` | Worker | No web owner |
