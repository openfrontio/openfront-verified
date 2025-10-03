# ==============================================================================
# Server-Only Dockerfile for OpenFrontIO
# ==============================================================================
# This builds and runs ONLY the game server (no nginx, no Cloudflare tunnel)
# Perfect for local development or self-hosted deployments
#
# Usage:
#   docker build -f Server.Dockerfile -t openfront-server .
#   docker run -p 3000:3000 -p 3001-3020:3001-3020 --env-file .env openfront-server
#
# ==============================================================================

# Stage 1: Build dependencies
FROM node:24-slim AS base
WORKDIR /usr/src/app

# Stage 2: Install production dependencies
FROM base AS dependencies
ENV HUSKY=0
ENV NPM_CONFIG_IGNORE_SCRIPTS=1

COPY package*.json ./
RUN npm ci --omit=dev

# Stage 3: Build TypeScript (if needed for server)
FROM base AS build
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT="$GIT_COMMIT"
ENV HUSKY=0

COPY package*.json ./
RUN npm ci

COPY . .

# TypeScript is compiled on-the-fly by ts-node, but we can pre-compile for performance
# RUN npx tsc --project tsconfig.json --outDir dist

# Stage 4: Final runtime image
FROM base

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT="$GIT_COMMIT"

# Copy production dependencies
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY package.json ./

# Copy application source
COPY src ./src
COPY tsconfig.json ./
COPY resources ./resources

# Create necessary directories
RUN mkdir -p /var/log/openfront /tmp/openfront-data \
  && chown -R node:node /var/log/openfront /tmp/openfront-data

# Set default environment variables
ENV NODE_ENV=production
ENV WALLET_LINK_FILE=/tmp/openfront-data/wallet-links.json

# Expose ports
# 3000 = Master process (API, public lobbies)
# 3001-3020 = Worker processes (game servers)
EXPOSE 3000
EXPOSE 3001-3020

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Switch to node user for security
USER node

# Start the server directly (no supervisor needed)
CMD ["npm", "run", "start:server"]
