# Frontend Migration Wiring — Spec

**Date:** 2026-07-15  
**Status:** Approved  
**Goal:** Replace the old vanilla HTML/JS/CSS frontend with the already-built React+Vite app at `apps/web/`, without changing any UI code in the new app.

---

## Context

The old frontend lives at `apps/server/src/resume_kb_server/static/` (4 files: `index.html`, `app.js`, `auth.js`, `style.css`). It's served by FastAPI's `StaticFiles` mount.

The new frontend at `apps/web/` is a complete React 19 + Vite 6 + Tailwind v4 + shadcn/ui app already wired to the same `/api/*` endpoints. It builds to `apps/web/dist/` via `npm run build`.

A build script `scripts/build-web.sh` already exists that builds the web app and copies `dist/*` into the server's static directory.

---

## Changes

### 1. Dockerfile — Add Node.js build stage

Add a Node.js build stage before the Python runtime stage:

```dockerfile
FROM node:20-alpine AS web-build
WORKDIR /app/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build
```

In the Python runtime stage, replace `COPY apps/ apps/` with:
- `COPY apps/server/ apps/server/`
- `COPY --from=web-build /app/apps/web/dist/ apps/server/src/resume_kb_server/static/`

This means production images contain only the built assets, not Node.js or source.

### 2. Server `app.py` — SPA catch-all route

The Vite build produces a single `index.html` with hashed asset references. Client-side navigation means any non-`/api` path must serve `index.html`.

Before the existing `app.mount("/", StaticFiles(...))` line, add a catch-all HTML response for non-API, non-static-asset paths. The simplest approach: keep `StaticFiles(directory=STATIC_DIR, html=True)` — FastAPI's `html=True` already serves `index.html` for directory paths and 404s fall through to it. Verify this handles SPA routing; if not, add an explicit catch-all.

### 3. Delete old static files

Remove:
- `apps/server/src/resume_kb_server/static/app.js`
- `apps/server/src/resume_kb_server/static/auth.js`
- `apps/server/src/resume_kb_server/static/index.html`
- `apps/server/src/resume_kb_server/static/style.css`

### 4. `.gitignore` updates

Add:
```
apps/web/dist/
apps/server/src/resume_kb_server/static/
```

The static dir is now a build artifact (populated by `scripts/build-web.sh` locally or the Docker build stage in CI).

### 5. `scripts/build-web.sh` — No changes needed

Already does:
```bash
cd apps/web && npm run build
rm -rf ../server/src/resume_kb_server/static/*
cp -r dist/* ../server/src/resume_kb_server/static/
```

### 6. Dev workflow (no file changes)

- Run FastAPI: `uv run uvicorn --factory resume_kb_server.app:create_app --port 8000`
- Run Vite: `cd apps/web && npm run dev` (port 5173, proxies `/api` to `:8000`)
- Develop against Vite dev server; the proxy handles API calls transparently.

---

## What does NOT change

- Any file in `apps/web/src/` — no font, animation, color, or component modifications
- FastAPI API endpoints (routes, request/response shapes)
- Python packages or their code
- `railway.toml` (still uses Dockerfile builder)

---

## Future work

- **Prompts admin panel:** The old UI had an extraction-prompt editor (`/api/prompts` CRUD). The new React UI does not include this. Add as a separate feature later.

---

## Risk

- **SPA routing:** `StaticFiles(html=True)` should handle this since it serves `index.html` for any path that doesn't match a real file. If a deployed environment uses path-based routing that conflicts, the catch-all needs explicit handling. Low risk — standard Vite SPA pattern.
- **Build cache:** Docker layer caching on `package-lock.json` COPY ensures `npm ci` only reruns when deps change. Standard practice.
