# Multi-stage build for optimized frontend

# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY . .
ENV GENERATE_SOURCEMAP=false
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Production with nginx
FROM nginx:1.27-alpine AS production

# Install security updates
RUN apk update && \
    apk upgrade && \
    rm -rf /var/cache/apk/*

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built app
COPY --from=builder /app/build /usr/share/nginx/html

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80 || exit 1

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
