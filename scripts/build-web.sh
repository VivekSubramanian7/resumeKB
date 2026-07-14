#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../apps/web"
npm run build
rm -rf ../server/src/resume_kb_server/static/*
cp -r dist/* ../server/src/resume_kb_server/static/
echo "Built and deployed to server static dir"
