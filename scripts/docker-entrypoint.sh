#!/bin/sh
set -e

mkdir -p "${KB_DATA_DIR:-/data/kb-data}"

exec uv run uvicorn \
  --factory resume_kb_server.app:create_app \
  --host 0.0.0.0 \
  --port "${PORT:-8137}"
