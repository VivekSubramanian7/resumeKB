# Frontend Wiring Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built React+Vite app (`apps/web/`) as the production frontend, delete the old vanilla static files, and update the Docker build pipeline.

**Architecture:** Multi-stage Docker build — Node stage builds the Vite app, Python runtime stage serves the output via FastAPI's StaticFiles mount. Locally, `scripts/build-web.sh` does the same copy. No UI code changes.

**Tech Stack:** Docker (multi-stage), FastAPI StaticFiles, Vite build output, bash

## Global Constraints

- Do NOT modify any file under `apps/web/src/` — fonts, animations, colors, components are frozen
- FastAPI API endpoints remain unchanged
- Python packages remain unchanged
- `railway.toml` remains unchanged (still Dockerfile builder)
- The server's `StaticFiles(html=True)` mount handles SPA routing (serves `index.html` for non-file paths)

---

### Task 1: Delete old static UI and update .gitignore

**Files:**
- Delete: `apps/server/src/resume_kb_server/static/app.js`
- Delete: `apps/server/src/resume_kb_server/static/auth.js`
- Delete: `apps/server/src/resume_kb_server/static/index.html`
- Delete: `apps/server/src/resume_kb_server/static/style.css`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: empty `static/` directory; `.gitignore` excludes `apps/web/dist/` and `apps/server/src/resume_kb_server/static/`

- [ ] **Step 1: Delete old static files**

```bash
rm apps/server/src/resume_kb_server/static/app.js
rm apps/server/src/resume_kb_server/static/auth.js
rm apps/server/src/resume_kb_server/static/index.html
rm apps/server/src/resume_kb_server/static/style.css
```

- [ ] **Step 2: Add a .gitkeep so the static dir exists for local dev before build**

```bash
touch apps/server/src/resume_kb_server/static/.gitkeep
```

- [ ] **Step 3: Update .gitignore**

Append to `.gitignore`:

```
# Frontend build artifacts
apps/web/dist/
apps/server/src/resume_kb_server/static/*
!apps/server/src/resume_kb_server/static/.gitkeep
```

- [ ] **Step 4: Verify git status shows only intended deletions and .gitignore change**

```bash
git status
```

Expected: 4 deleted files, modified `.gitignore`, new `.gitkeep`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/resume_kb_server/static/ .gitignore
git commit -m "chore: remove old vanilla frontend, gitignore build artifacts"
```

---

### Task 2: Update Dockerfile with Node.js build stage

**Files:**
- Modify: `Dockerfile`

**Interfaces:**
- Consumes: `apps/web/package.json`, `apps/web/package-lock.json`, `apps/web/` source
- Produces: Docker image where `apps/server/src/resume_kb_server/static/` contains the Vite build output (`index.html` + `assets/`)

- [ ] **Step 1: Rewrite Dockerfile with multi-stage build**

Replace the entire `Dockerfile` with:

```dockerfile
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
```

- [ ] **Step 2: Verify Dockerfile builds successfully**

```bash
docker build -t resumekb-test .
```

Expected: both stages complete without error. The `web-build` stage runs `npm ci` and `npm run build`; the Python stage copies the output.

- [ ] **Step 3: Verify the built image serves the React app**

```bash
docker run --rm -e AUTH_DISABLED=true -e KB_EXTRACTOR=fake -p 8137:8137 resumekb-test &
sleep 5
curl -s http://localhost:8137/ | head -5
docker stop $(docker ps -q --filter ancestor=resumekb-test)
```

Expected: HTML containing `<div id="root">` and a `<script` tag pointing to `/assets/`.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "build: multi-stage Dockerfile with Node frontend build"
```

---

### Task 3: Verify local dev workflow with build script

**Files:**
- None modified (verification only)

**Interfaces:**
- Consumes: `scripts/build-web.sh`, `apps/web/` source, server static dir
- Produces: confidence that `scripts/build-web.sh` works end-to-end

- [ ] **Step 1: Run the build script**

```bash
bash scripts/build-web.sh
```

Expected: outputs "Built and deployed to server static dir"

- [ ] **Step 2: Verify static dir has Vite output**

```bash
ls apps/server/src/resume_kb_server/static/
```

Expected: `index.html`, `assets/` directory (with `.js` and `.css` files)

- [ ] **Step 3: Start the FastAPI server and verify it serves the React app**

```bash
cd apps/server && uv run uvicorn --factory resume_kb_server.app:create_app --port 8000 &
sleep 2
curl -s http://localhost:8000/ | grep -o '<div id="root">'
kill %1
```

Expected: `<div id="root">`

- [ ] **Step 4: Verify API endpoint still works**

```bash
cd apps/server && uv run uvicorn --factory resume_kb_server.app:create_app --port 8000 &
sleep 2
curl -s http://localhost:8000/api/config | python -m json.tool | head -5
kill %1
```

Expected: JSON with `extractor_backend`, `whisper_model`, etc.

- [ ] **Step 5: Clean up static dir (restored to gitkeep-only)**

```bash
rm -rf apps/server/src/resume_kb_server/static/*
touch apps/server/src/resume_kb_server/static/.gitkeep
```

No commit needed — this task is verification only.

---

## Summary

| Task | What | Files changed |
|------|------|---------------|
| 1 | Delete old UI + gitignore | 4 deleted, `.gitignore` modified, `.gitkeep` added |
| 2 | Multi-stage Dockerfile | `Dockerfile` rewritten |
| 3 | Verify local workflow | No changes (smoke test) |

Total: 2 commits, ~40 lines of Dockerfile, 3 lines of gitignore.
