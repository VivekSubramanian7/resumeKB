# ── Stage 1: Build React frontend ──
FROM node:20-alpine AS web-build
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

# ── Stage 2: Python runtime ──
FROM python:3.11-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/app/.cache/huggingface \
    WHISPER_MODEL=small.en \
    WHISPER_DEVICE=cpu \
    WHISPER_COMPUTE=int8 \
    KB_DATA_DIR=/data/kb-data \
    PROMPTS_ROOT=/app/prompts \
    PORT=8137

COPY pyproject.toml uv.lock ./
COPY packages/ packages/
COPY apps/server/ apps/server/
COPY prompts/ prompts/
COPY scripts/cache_whisper_model.py scripts/cache_whisper_model.py
COPY scripts/docker-entrypoint.sh scripts/docker-entrypoint.sh

# Copy built frontend into server static dir
COPY --from=web-build /app/dist/ apps/server/src/resume_kb_server/static/

RUN uv sync --frozen --no-dev \
    && chmod +x scripts/docker-entrypoint.sh

EXPOSE 8137

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
