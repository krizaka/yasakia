# -------------------------------------------------------------
# Yasakia API — production image: the Next.js standalone server + the bundled migrator (PRE_DEPLOY job).
# -------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 1. Dependencies (sharp brings its own libvips build for musl)
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/site/package.json ./apps/site/
COPY packages/db/package.json ./packages/db/
COPY packages/media/package.json ./packages/media/
COPY packages/config/package.json ./packages/config/
RUN npm ci --no-audit --no-fund

# 2. Build
FROM base AS builder
COPY --from=deps /app ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# The public origin of the API (signed upload URLs are built on it), passed by App Platform at build time.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
# Where the app is served (dev.yasakia.com: /app, next to the static site at /), the deployment's kind and the commit
# shown as the build's version — all inlined at build time.
ARG NEXT_PUBLIC_APP_BASE_PATH
ARG NEXT_PUBLIC_APP_ENV
ARG APP_COMMIT_SHA
ENV NEXT_PUBLIC_APP_BASE_PATH=$NEXT_PUBLIC_APP_BASE_PATH \
    NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV \
    APP_COMMIT_SHA=$APP_COMMIT_SHA
# The public landing (apps/site, a static export) is built first and copied into apps/web/public: one service serves the landing,
# the legal pages, the console and the API (scripts/sync-site.mjs).
RUN npm run build:site && node scripts/sync-site.mjs && npm run build --workspace=@yasakia/web
# Self-contained migrator (drizzle-orm + pg bundled): `node migrate.cjs`
RUN npm run build:migrator --workspace=@yasakia/db

# 3. Run
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ARG NEXT_PUBLIC_APP_BASE_PATH
ENV NEXT_PUBLIC_APP_BASE_PATH=$NEXT_PUBLIC_APP_BASE_PATH

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# The landing (static files) and its assets.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
# E-mail templates are read from disk at run time (data, not code).
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/mail-templates ./apps/web/mail-templates
# Database migrations: `node migrate.cjs` applies ./drizzle (0000 creates the extensions) to DATABASE_DIRECT_URL or DATABASE_URL.
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/dist/migrate.cjs ./migrate.cjs
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/drizzle ./drizzle

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://localhost:3000${NEXT_PUBLIC_APP_BASE_PATH}/api/healthz" || exit 1

CMD ["node", "apps/web/server.js"]
