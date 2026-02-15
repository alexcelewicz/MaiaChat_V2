# Gateway Service Dockerfile
# Builds Clawdbot gateway as a containerized service for MaiaChat

FROM node:20-alpine AS builder

WORKDIR /app

# Copy clawdbot source
COPY clawdbot-source/ .

# Install dependencies
RUN npm ci --production=false

# Build the gateway
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 gateway
RUN adduser --system --uid 1001 gateway

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Set ownership
RUN chown -R gateway:gateway /app

USER gateway

# Environment variables (override at runtime)
ENV NODE_ENV=production
ENV GATEWAY_PORT=18789
ENV GATEWAY_HOST=0.0.0.0
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:18789/health || exit 1

# Expose gateway port
EXPOSE 18789

# Start gateway server
CMD ["node", "dist/gateway/server.js"]
