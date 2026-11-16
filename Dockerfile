# syntax=docker/dockerfile:1
# =============================================================================
# Stage 1 — dependency installer
#   • Uses npm ci (not npm install) for deterministic, audit-friendly installs.
#   • The result is kept separate so the runtime stage inherits nothing else.
# =============================================================================
FROM node:22-slim AS deps
WORKDIR /app

# System packages needed only to build native addons (sharp, bcryptjs).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy manifests first so Docker can cache this layer.
COPY package*.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json

# Install ALL deps (including dev) so the build step can run.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# =============================================================================
# Stage 2 — Litestream binary
# =============================================================================
FROM litestream/litestream:0.3.13 AS litestream

# =============================================================================
# Stage 3 — ONNX background-removal model (optional, build-time bake-in)
#   The node one-liner downloads the model and verifies its SHA-256 checksum.
#   If GitHub is unreachable the build still succeeds; the server downloads it
#   on first use instead.
# =============================================================================
FROM node:22-slim AS bgmodel
ENV BG_MODEL_FILE=/app/models/isnet-general-use.onnx
RUN mkdir -p /app/models && node -e " \
  const fs=require('fs'),c=require('crypto'); \
  fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx') \
    .then(async r=>{if(!r.ok)throw new Error('HTTP '+r.status); \
      const b=Buffer.from(await r.arrayBuffer()); \
      const h=c.createHash('sha256').update(b).digest('hex'); \
      if(h!=='60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a') \
        throw new Error('checksum '+h); \
      fs.writeFileSync(process.env.BG_MODEL_FILE,b); \
      console.log('[build] background model ready')}) \
    .catch(e=>{console.error('[build] background model skipped:',e.message);process.exit(0)})"

# =============================================================================
# Stage 4 — web builder
# =============================================================================
FROM deps AS builder
COPY shared ./shared
COPY server ./server
COPY web ./web
# Build the React SPA — produces web/dist
RUN npm run build --workspace=web

# =============================================================================
# Stage 5 — production runtime (lean, non-root)
# =============================================================================
FROM node:22-slim AS runtime
WORKDIR /app

# Production-only system packages.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
 && rm -rf /var/lib/apt/lists/*
# ffmpeg: بيحوّل فيديو الستوري لـ H.264 صغير (فيديو الآيفون وغيره). من غيره السيرفر بيقبل MP4/H.264 بس.

# Litestream binary from stage 2.
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream

# ONNX background-removal model from stage 3.
ENV BG_MODEL_FILE=/app/models/isnet-general-use.onnx
COPY --from=bgmodel /app/models /app/models

# Copy manifests and install PRODUCTION-only deps.
COPY package*.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# Source code — copied AFTER deps to maximize cache reuse.
COPY shared ./shared
COPY server ./server
# Web: only the built static assets are needed in production.
COPY --from=builder /app/web/dist ./web/dist

# Litestream replication config.
RUN sed -i 's/\r$//' /app/server/start.sh /app/server/litestream.yml \
 && chmod +x /app/server/start.sh \
 && cp /app/server/litestream.yml /etc/litestream.yml

# Ensure the data directory exists and is owned by the node user.
RUN mkdir -p /app/server/data /app/.model-cache \
 && chown -R node:node /app

# ⚠️ NEVER run as root in production.
USER node

# CLIP model cache (temperature cache, not persistent data).
ENV MODEL_CACHE_DIR=/app/.model-cache

ENV PORT=10000
EXPOSE 10000

# Liveness: /api/health responds immediately (always 200).
# Readiness: /api/ready returns 200 only after the DB is initialized and
# migrations are applied. Use /api/ready as the HEALTHCHECK target so
# container orchestrators know when the app is ready to serve real traffic.
HEALTHCHECK --interval=20s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/app/server/start.sh"]
