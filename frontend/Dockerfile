# ─────────────────────────────────────────────────────────────────
# DAY 4 – React Frontend Dockerfile
# Multi-stage: build (production bundle) + serve
# For development we use the dev server directly.
# ─────────────────────────────────────────────────────────────────

FROM node:18-slim

# ── Environment ───────────────────────────────────────────────────
ENV NODE_ENV=development \
    CHOKIDAR_USEPOLLING=true \
    WDS_SOCKET_PORT=0

# ── Install curl for healthcheck ──────────────────────────────────
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# ── Work directory ────────────────────────────────────────────────
WORKDIR /app

# ── Install dependencies (cached layer) ───────────────────────────
COPY package*.json ./
RUN npm install

# ── Copy source ───────────────────────────────────────────────────
COPY . .

# ── Expose React dev server port ──────────────────────────────────
EXPOSE 3000

# ── Health check ──────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

# ── Start React dev server ────────────────────────────────────────
CMD ["npm", "start"]
