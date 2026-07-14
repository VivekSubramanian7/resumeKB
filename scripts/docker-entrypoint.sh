#!/bin/sh
set -e

mkdir -p "${KB_DATA_DIR:-/data/kb-data}"

# Cache whisper model on first boot (no-op if already present via volume mount)
uv run python scripts/cache_whisper_model.py

exec uv run uvicorn \
  --factory resume_kb_server.app:create_app \
  --host 0.0.0.0 \
  --port "${PORT:-8137}"
