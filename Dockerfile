# resumeKB — Railway-ready image with faster-whisper small.en baked in.
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
COPY apps/ apps/
COPY prompts/ prompts/
COPY scripts/cache_whisper_model.py scripts/cache_whisper_model.py
COPY scripts/docker-entrypoint.sh scripts/docker-entrypoint.sh

RUN uv sync --frozen --no-dev \
    && uv run python scripts/cache_whisper_model.py \
    && chmod +x scripts/docker-entrypoint.sh

EXPOSE 8137

VOLUME ["/data/kb-data"]

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
