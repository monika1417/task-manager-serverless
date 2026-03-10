# ─────────────────────────────────────────────────────────────────
# Django Backend Dockerfile
# Python 3.12 slim image, production-ready with health check
# Includes: JWT Auth, S3 Pre-signed URLs, Analytics, Microservice
# ─────────────────────────────────────────────────────────────────

FROM python:3.12-slim

# ── Environment variables ─────────────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# ── System dependencies (needed by some Python packages) ──────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Work directory ────────────────────────────────────────────────
WORKDIR /app

# ── Install Python dependencies (cached layer) ───────────────────
COPY requirements.txt /app/
RUN pip install --upgrade pip && pip install -r requirements.txt

# ── Copy project source ───────────────────────────────────────────
COPY . /app/

# ── Expose Django port ────────────────────────────────────────────
EXPOSE 8000

# ── Health check ──────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

# ── Start Django development server ──────────────────────────────
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
