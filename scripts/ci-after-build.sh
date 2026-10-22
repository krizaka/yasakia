#!/usr/bin/env bash
# Run by the org's node-ci after `npm run build`, from the repository root (browsers installed and cached by node-ci).
set -euo pipefail
node scripts/generate-docs.mjs --check
node scripts/check-app-links.mjs
# `npm run build` built the landing (apps/site, a static export) and copied it into apps/web/public.
python3 -m http.server 3000 --directory apps/web/public >/dev/null 2>&1 &
sleep 2
node scripts/check-seo-family.mjs --base http://localhost:3000 --host https://www.yasakia.com --types WebSite,SoftwareApplication
# Responsive guard: no horizontal overflow at 360-1440 px in both themes, on the landing and the pages it links.
npm run check:overflow -- --base http://localhost:3000
