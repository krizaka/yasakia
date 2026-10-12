# -------------------------------------------------------------
# Yazakia API — production image: the Next.js standalone server + the bundled migrator (PRE_DEPLOY job).
# -------------------------------------------------------------
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 1. Dependencies (sharp brings its own libvips build for musl)
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
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
RUN npm run build --workspace=@yazakia/web
# Self-contained migrator (drizzle-orm + pg bundled): `node migrate.cjs`
RUN npm run build:migrator --workspace=@yazakia/db

# 3. Run
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# E-mail templates are read from disk at run time (data, not code).
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/mail-templates ./apps/web/mail-templates
# Database migrations: `node migrate.cjs` applies ./drizzle (0000 creates the extensions) to DATABASE_DIRECT_URL or DATABASE_URL.
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/dist/migrate.cjs ./migrate.cjs
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/drizzle ./drizzle

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/healthz || exit 1

CMD ["node", "apps/web/server.js"]
