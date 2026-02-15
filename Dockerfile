# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

# Install dependencies needed for native modules
RUN apk add --no-cache libc6-compat python3 make g++

# Use system Chromium in runtime image instead of downloading Playwright browsers
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Set build-time environment variables
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_APP_VERSION
ARG SENTRY_AUTH_TOKEN

ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV DOCKER=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV MAIACHAT_DISABLE_AUTOSTART=1

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Python + uv for skill script execution
RUN apk add --no-cache \
  python3 \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ttf-freefont
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
ENV UV_CACHE_DIR=/app/.uv-cache

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV MAIACHAT_DISABLE_AUTOSTART=0
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy migration files and scripts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/skills-data ./skills-data
COPY --from=builder /app/config/soul-defaults ./config/soul-defaults
COPY start.sh ./start.sh
COPY migrate.js ./migrate.js

# Install pg for migrations (as root before switching user)
# Note: dotenv is optional in migrate.js - env vars are set by Docker
RUN npm init -y && npm install pg --save

# Set permissions
RUN chmod +x ./start.sh
RUN mkdir -p /app/.uv-cache
RUN mkdir -p /app/workspaces
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# Health check (extended start period for migrations)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["./start.sh"]
