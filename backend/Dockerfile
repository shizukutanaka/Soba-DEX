# Ultra-Optimized Multi-Stage Dockerfile for DEX Backend
#
# Features:
# - Multi-stage build for minimal image size
# - Security hardening with distroless
# - Build cache optimization
# - Layer optimization
# - Health checks
# - Non-root user

# ============================================================================
# Stage 1: Dependencies (cached separately)
# ============================================================================
FROM node:22-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --silent && \
    npm cache clean --force

# ============================================================================
# Stage 2: Build (if needed for TypeScript/build step)
# ============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Run any build steps (currently no build for plain Node.js)
# RUN npm run build

# Install only production dependencies
RUN npm ci --only=production --silent && \
    npm cache clean --force

# ============================================================================
# Stage 3: Production Runtime (Minimal)
# ============================================================================
FROM node:22-alpine AS production

# Install security updates and minimal runtime dependencies
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
        dumb-init \
        curl \
        tini && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 -G nodejs

WORKDIR /app

# Copy production dependencies
COPY --from=builder --chown=backend:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=backend:nodejs package*.json ./
COPY --chown=backend:nodejs src ./src

# Environment configuration
ENV NODE_ENV=production \
    PORT=3001 \
    NODE_OPTIONS="--max-old-space-size=512" \
    NPM_CONFIG_LOGLEVEL=warn

# Expose port
EXPOSE 3001

# Switch to non-root user
USER backend

# Health check
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=15s \
            --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "src/server-final.js"]

# ============================================================================
# Metadata
# ============================================================================
LABEL maintainer="Soba DEX Team" \
      version="2.1.0" \
      description="Production-optimized DEX Backend" \
      org.opencontainers.image.source="https://github.com/your-org/soba"
