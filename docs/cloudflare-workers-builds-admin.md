# Cloudflare Workers Builds Setup for Admin

This repository can publish the admin Worker through Cloudflare Workers Builds instead of uploading from a local Windows machine.

## Current target

- Worker name: `smart-money-admin`
- Custom domain: `admin.lukaluka.fun`
- Wrangler config: `apps/web/wrangler.jsonc`
- Deployment snapshot branch: `codex/workers-builds-admin-2026-04-30`

## Current verified status

- The admin app now completes `npm run build:cloudflare -w apps/web` locally with the current working tree.
- The `apps/web` package now rebuilds `@weather-smart-money/core` and `@weather-smart-money/data` automatically before `dev`, `build`, and `build:cloudflare`, which fixes the stale-internal-package runtime breakage that caused page switching failures.
- Direct deploys from this Windows machine still fail while uploading the Worker script body to Cloudflare with `ECONNRESET` / `socket hang up`, even after retrying with a minified bundle.
- The existing Worker `smart-money-admin` is present in Cloudflare, and Workers Builds is now active:
  - repo connection is active for `xxoo13149/smart-money-pro`
  - a user-owned build token exists
  - both production and non-production triggers exist and were updated through the Cloudflare API
- The deployment snapshot branch `codex/workers-builds-admin-2026-04-30` now exists on GitHub and is the current production branch configured in Cloudflare Workers Builds.
- Cloudflare production build `9f625865-cc93-4b18-95e5-e75289f2ec3b` completed successfully on `2026-04-30T04:32:39.601Z`.

## Recommended Workers Builds settings

Connect the GitHub repository `xxoo13149/smart-money-pro` to the existing Worker `smart-money-admin`, then use these settings:

- Production branch: `codex/workers-builds-admin-2026-04-30`
- Root directory: `/`
- Build command: `npm run build:cloudflare -w apps/web`
- Deploy command: `node scripts/wrangler-cli.mjs deploy -c apps/web/wrangler.jsonc`
- Version command: `node scripts/wrangler-cli.mjs versions upload -c apps/web/wrangler.jsonc`

The admin workspace now rebuilds its internal monorepo packages automatically before every `dev`, `build`, and `build:cloudflare` run. For Workers Builds, keep the root at the repository root so npm installs the monorepo workspaces correctly, then run the admin workspace build through `-w apps/web`.

## Optional watch paths

If you enable path-based build triggers in the Cloudflare UI, keep the scope tight:

- `apps/web/**`
- `packages/core/**`
- `packages/data/**`
- `scripts/wrangler-cli.mjs`
- `package.json`
- `package-lock.json`

## Secrets and runtime config

Keep these secrets configured on the Worker before the first production build:

- `ADMIN_APPROVAL_SHARED_SECRET`
- `GEMINI_API_KEY` if Gemini is enabled
- `GROQ_API_KEY` if Groq is enabled
- `FINDER_SYNC_TOKEN` if Finder sync is enabled

Optional runtime config:

- `FINDER_ALLOWED_ORIGINS`

The bindings already declared in `apps/web/wrangler.jsonc` should continue to point at the existing production resources:

- KV: `smart-money-cache`
- D1: `smart-money-prod`

## First rollout checklist

1. In Cloudflare, open the Worker `smart-money-admin`.
2. Ensure Workers Builds stays connected to `xxoo13149/smart-money-pro`.
3. Keep the branch, root directory, build command, and deploy command above.
4. Verify the existing Worker secrets are still present.
5. Trigger a production build from `codex/workers-builds-admin-2026-04-30` when admin app changes are ready.
6. After the build succeeds, confirm `admin.lukaluka.fun` is serving the new deployment.

## Why this route

The current local blocker is not the app build anymore. The app now builds successfully, but large Worker uploads from this Windows machine are being reset mid-transfer. Workers Builds moves both build and deploy into Cloudflare's own infrastructure and avoids that upload path entirely.
