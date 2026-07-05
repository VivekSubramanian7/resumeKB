# Voice-First Professional Knowledge Base — v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A voice-first web app: the user records ≤2-minute professional voice notes (transcribed locally with faster-whisper), uploads a CV (PDF/DOCX), and imports GitHub / LinkedIn-export data — all feeding an OKF-style markdown knowledge base — with **user-editable extraction prompts** (`prompts/*.md`), **OpenAI-powered structured extraction**, and a **design-led frontend** built with the frontend-design skill and polished with impeccable.

**Architecture:** uv monorepo of five reusable Python packages (`kb-core`, `voice-transcribe`, `knowledge-extract`, `doc-ingest`, `profile-ingest`) composed by a FastAPI app (`apps/server`) serving a static single-page frontend. The knowledge base follows Google's **Open Knowledge Format (OKF)** (markdown files + YAML frontmatter + `[[wikilinks]]` + auto-generated `index.md`), layered the way **OpenKB** does it (source ingestion → cross-linked entity pages → vectorless retrieval). Extraction prompts are plain markdown files in `prompts/`, hot-read on every request and editable via API and UI.

**Tech Stack (grounded per task below):** Python 3.11+, uv workspaces + hatchling, faster-whisper + PyAV, OpenAI Python SDK (`client.responses.parse` structured outputs with Pydantic), markitdown, httpx, SQLite FTS5, PyYAML, python-dotenv, FastAPI + uvicorn, vanilla ES-module frontend (no build step), pytest + respx + Playwright.

**Locked design decisions:**

1. **OKF entry format** — frontmatter keys `title`, `type`, `tags`, `sources`, `created`, `updated`; body markdown with `[[slug]]` wikilinks. Entry types: `note`, `skill`, `project`, `experience`, `organization`, `person`, `source`. **The frontmatter parser must anchor on delimiter lines** (v1 review found that splitting on the `---` substring silently corrupts entries whose title/body contains `---` — realistic for transcripts; the fixed parser is specified in Task 2).
2. **Extraction via OpenAI structured outputs** — `client.responses.parse(model=..., instructions=<prompt md>, input=<text>, text_format=<PydanticModel>)` → `response.output_parsed`. Requires `openai>=1.66` and a structured-outputs-capable model (default `gpt-4o`, overridable via `OPENAI_MODEL`). A deterministic `FakeStructuredExtractor` powers all tests and keyless demo mode (`KB_EXTRACTOR=fake`).
3. **Prompts are user-owned files** — `prompts/professional_update.md` and `prompts/cv_profile.md` at the repo root, read from disk on every extraction (edit → next request uses the new prompt, no restart). Exposed via `GET /api/prompts`, `GET /api/prompts/{name}`, `PUT /api/prompts/{name}` and an editor panel in the UI. **The prompt editor is admin-only in the UI:** hidden by default, revealed by an `#admin-toggle` switch in the header (client-side gate for now — a deliberate placeholder for real authentication later; the API itself stays open in this iteration and this is documented in the README).
4. **2-minute limit enforced twice** — client-side (recorder auto-stops at 120 s) and server-side (PyAV probes container duration, rejects >120 s with HTTP 422 *before* transcription).
5. **LinkedIn** — official data-export ZIP only (`Profile.csv`, `Positions.csv`, `Skills.csv`, `Education.csv`); scraping violates LinkedIn ToS. **CV** — PDF and DOCX via markitdown; legacy `.doc` rejected with a clear message.
6. **Testing is E2E-only (per spec).** No unit or per-module test files. Module tasks end with runnable smoke-verification commands; correctness is proven by two E2E layers: (a) API-level pipeline tests with real synthesized speech (Windows SAPI TTS) through real whisper transcription into the real store, and (b) Playwright browser tests with Chromium's fake-microphone. GitHub is mocked with respx (network determinism), everything else is real.
7. **Frontend is design-led, not an afterthought.** Task 12 hands a written design brief + a stable element-ID contract to the **frontend-design skill**; Task 13 runs an **impeccable** review pass and applies its findings. The ID contract keeps Playwright tests decoupled from visual iteration.
8. **Config via `.env`** — the repo already has a git-ignored `.env` (`KB_EXTRACTOR`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `KB_ROOT`, `WHISPER_MODEL`, `WHISPER_DEVICE`, `WHISPER_COMPUTE`, `GITHUB_TOKEN`, `PORT` — note port **8137**, 8000 is occupied on the dev machine). Settings load it with python-dotenv.

**Prerequisites (Windows dev machine):** `uv` on PATH; internet for first `uv sync` and first whisper model download; `OPENAI_API_KEY` present in `.env` (already there). No ffmpeg needed (PyAV bundles it).

---

## File Structure

```
resumeKB/
├── pyproject.toml                          # uv workspace root (virtual)
├── prompts/                                # USER-EDITABLE extraction prompts
│   ├── professional_update.md
│   └── cv_profile.md
├── packages/
│   ├── kb-core/src/kb_core/                # models.py, index.py, store.py, __init__.py
│   ├── voice-transcribe/src/voice_transcribe/   # audio.py, transcriber.py, __init__.py
│   ├── knowledge-extract/src/knowledge_extract/ # schemas.py, prompts.py, extractors.py, mapping.py, __init__.py
│   ├── doc-ingest/src/doc_ingest/          # convert.py, cv.py, __init__.py
│   └── profile-ingest/src/profile_ingest/  # github.py, linkedin.py, __init__.py
├── apps/server/src/resume_kb_server/
│   ├── settings.py, fakes.py, app.py, __init__.py
│   └── static/                             # index.html, app.js, style.css (Task 12 owns look & feel)
├── tests/
│   ├── conftest.py                         # audio fixtures (SAPI speech WAV, tone WAV)
│   └── e2e/                                # THE test suite (E2E only)
│       ├── test_voice_note_flow.py
│       ├── test_duration_limit.py
│       ├── test_cv_flow.py
│       ├── test_sources_flow.py
│       ├── test_prompts_api.py
│       └── test_browser.py
└── docs/superpowers/plans/2026-07-05-voice-first-kb-v2.md
```

---

### Task 1: Workspace scaffolding + prompts directory

**Tech grounding:** uv workspaces, hatchling build backend, python-dotenv, pytest markers.

**Files:**
- Create: `pyproject.toml` (root), `packages/{kb-core,voice-transcribe,knowledge-extract,doc-ingest,profile-ingest}/pyproject.toml`, `apps/server/pyproject.toml`
- Create: one docstring-only `__init__.py` per package module dir
- Create: `prompts/professional_update.md`, `prompts/cv_profile.md`

- [ ] **Step 1: Root `pyproject.toml`**

```toml
[project]
name = "resume-kb"
version = "0.2.0"
description = "Voice-first professional knowledge base (v2)"
requires-python = ">=3.11"
dependencies = [
    "kb-core",
    "voice-transcribe",
    "knowledge-extract",
    "doc-ingest",
    "profile-ingest",
    "resume-kb-server",
]

[tool.uv]
package = false

[tool.uv.workspace]
members = ["packages/*", "apps/*"]

[tool.uv.sources]
kb-core = { workspace = true }
voice-transcribe = { workspace = true }
knowledge-extract = { workspace = true }
doc-ingest = { workspace = true }
profile-ingest = { workspace = true }
resume-kb-server = { workspace = true }

[dependency-groups]
dev = [
    "pytest>=8.0",
    "httpx>=0.27",
    "respx>=0.21",
    "python-docx>=1.1",
    "pytest-playwright>=0.5",
    "uvicorn>=0.30",
    "ruff>=0.6",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
markers = [
    "e2e: full-pipeline end-to-end tests",
    "transcription: runs faster-whisper (downloads the tiny model on first run)",
    "browser: Playwright browser tests (needs 'playwright install chromium')",
]

[tool.ruff]
line-length = 100
target-version = "py311"
```

- [ ] **Step 2: Member pyprojects** (all hatchling; `[tool.hatch.build.targets.wheel] packages = ["src/<module>"]`)

`packages/kb-core/pyproject.toml`:

```toml
[project]
name = "kb-core"
version = "0.2.0"
description = "OKF-style markdown knowledge base: entries, store, FTS5 search"
requires-python = ">=3.11"
dependencies = ["pyyaml>=6.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/kb_core"]
```

`packages/voice-transcribe/pyproject.toml`:

```toml
[project]
name = "voice-transcribe"
version = "0.2.0"
description = "Audio probing/validation and faster-whisper transcription"
requires-python = ">=3.11"
dependencies = ["faster-whisper>=1.0", "av>=11.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/voice_transcribe"]
```

`packages/knowledge-extract/pyproject.toml` — **OpenAI SDK, not Anthropic**:

```toml
[project]
name = "knowledge-extract"
version = "0.2.0"
description = "OpenAI structured extraction of professional facts into KB entries, with file-based prompts"
requires-python = ">=3.11"
dependencies = ["openai>=1.66", "pydantic>=2.7", "kb-core"]

[tool.uv.sources]
kb-core = { workspace = true }

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/knowledge_extract"]
```

`packages/doc-ingest/pyproject.toml`:

```toml
[project]
name = "doc-ingest"
version = "0.2.0"
description = "CV/document conversion (PDF/DOCX) and CV profile extraction"
requires-python = ">=3.11"
dependencies = ["markitdown[pdf,docx]>=0.1", "pydantic>=2.7", "kb-core", "knowledge-extract"]

[tool.uv.sources]
kb-core = { workspace = true }
knowledge-extract = { workspace = true }

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/doc_ingest"]
```

`packages/profile-ingest/pyproject.toml`:

```toml
[project]
name = "profile-ingest"
version = "0.2.0"
description = "GitHub API and LinkedIn data-export ingestion into KB entries"
requires-python = ">=3.11"
dependencies = ["httpx>=0.27", "pydantic>=2.7", "kb-core"]

[tool.uv.sources]
kb-core = { workspace = true }

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/profile_ingest"]
```

`apps/server/pyproject.toml` — adds python-dotenv:

```toml
[project]
name = "resume-kb-server"
version = "0.2.0"
description = "FastAPI app composing the resumeKB packages"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.111",
    "uvicorn>=0.30",
    "python-multipart>=0.0.9",
    "python-dotenv>=1.0",
    "kb-core",
    "voice-transcribe",
    "knowledge-extract",
    "doc-ingest",
    "profile-ingest",
]

[tool.uv.sources]
kb-core = { workspace = true }
voice-transcribe = { workspace = true }
knowledge-extract = { workspace = true }
doc-ingest = { workspace = true }
profile-ingest = { workspace = true }

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/resume_kb_server"]
```

- [ ] **Step 3: Module skeletons** — docstring-only `__init__.py` at:

```
packages/kb-core/src/kb_core/__init__.py
packages/voice-transcribe/src/voice_transcribe/__init__.py
packages/knowledge-extract/src/knowledge_extract/__init__.py
packages/doc-ingest/src/doc_ingest/__init__.py
packages/profile-ingest/src/profile_ingest/__init__.py
apps/server/src/resume_kb_server/__init__.py
```

- [ ] **Step 4: The user-editable prompts**

`prompts/professional_update.md`:

```markdown
You extract structured professional information from the transcript of a spoken
status update.

Rules:
- Capture only skills, projects, achievements, and organizations that are
  explicitly mentioned in the transcript.
- Normalize skill names to their canonical form (e.g. "k8s" -> "Kubernetes",
  "postgres" -> "PostgreSQL").
- The summary must be a single sentence in the past tense, starting with a verb
  ("Completed...", "Shipped...", "Investigated...").
- Do not invent projects or achievements that were not stated.
```

`prompts/cv_profile.md`:

```markdown
You extract a structured professional profile from the markdown text of a
CV/resume.

Rules:
- Capture the person's full name, headline, and a 1-2 sentence summary.
- List every skill exactly once, normalized to canonical names.
- Capture every work experience with organization, title, dates as written,
  and a one-sentence description.
- Capture education entries with institution and degree.
- Do not invent information that is not present in the document.
```

- [ ] **Step 5: Sync and verify**

Run: `uv sync`
Expected: all 6 workspace members resolve and install.

Run: `uv run python -c "import kb_core, voice_transcribe, knowledge_extract, doc_ingest, profile_ingest, resume_kb_server; print('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml packages apps prompts uv.lock
git commit -m "chore(v2): scaffold uv workspace, packages, and editable prompts"
```

---

### Task 2: kb-core — OKF entry model (with hardened frontmatter parser)

**Tech grounding:** Python dataclasses, PyYAML (`safe_dump`/`safe_load`), compiled regex; OKF conventions (frontmatter + wikilinks).

**Files:**
- Create: `packages/kb-core/src/kb_core/models.py`
- Modify: `packages/kb-core/src/kb_core/__init__.py`

- [ ] **Step 1: Implement `models.py`** (this includes the v1-review fix: `_FRONTMATTER_RE` anchors on delimiter *lines*, and parsed YAML is validated as a mapping — do NOT replace with a `split("---")` approach):

```python
"""KB entry model: OKF-style markdown files with YAML frontmatter and wikilinks."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

import yaml

WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")
_SLUG_RE = re.compile(r"[^a-z0-9]+")
_FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n?(.*)", re.DOTALL)

ENTRY_TYPES = ("note", "skill", "project", "experience", "organization", "person", "source")


def slugify(text: str) -> str:
    """Lowercase ASCII slug; non-alphanumerics collapse to single hyphens."""
    return _SLUG_RE.sub("-", text.lower()).strip("-")


def extract_wikilinks(body: str) -> list[str]:
    return WIKILINK_RE.findall(body)


@dataclass
class KBEntry:
    slug: str
    title: str
    entry_type: str
    body: str
    tags: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def to_markdown(self) -> str:
        meta = {
            "title": self.title,
            "type": self.entry_type,
            "tags": self.tags,
            "sources": self.sources,
            "created": self.created_at.isoformat() if self.created_at else None,
            "updated": self.updated_at.isoformat() if self.updated_at else None,
        }
        front = yaml.safe_dump(meta, sort_keys=True, allow_unicode=True)
        return f"---\n{front}---\n\n{self.body.strip()}\n"

    @classmethod
    def from_markdown(cls, text: str, slug: str) -> KBEntry:
        match = _FRONTMATTER_RE.match(text)
        if not match:
            raise ValueError(f"entry {slug!r} has no frontmatter")
        front, body = match.groups()
        meta = yaml.safe_load(front) or {}
        if not isinstance(meta, dict):
            raise ValueError(f"entry {slug!r} has malformed frontmatter")
        return cls(
            slug=slug,
            title=meta.get("title", slug),
            entry_type=meta.get("type", "note"),
            body=body.strip(),
            tags=list(meta.get("tags") or []),
            sources=list(meta.get("sources") or []),
            created_at=datetime.fromisoformat(meta["created"]) if meta.get("created") else None,
            updated_at=datetime.fromisoformat(meta["updated"]) if meta.get("updated") else None,
        )
```

`packages/kb-core/src/kb_core/__init__.py`:

```python
"""kb_core: reusable OKF-style markdown knowledge base."""

from kb_core.models import ENTRY_TYPES, KBEntry, extract_wikilinks, slugify

__all__ = ["ENTRY_TYPES", "KBEntry", "extract_wikilinks", "slugify"]
```

- [ ] **Step 2: Smoke-verify** (E2E-only test policy — modules get runnable smoke checks, the pipeline gets the tests)

Run:

```powershell
uv run python -c "from datetime import datetime, timezone; from kb_core import KBEntry; now = datetime(2026, 7, 5, tzinfo=timezone.utc); e = KBEntry(slug='n', title='Q1 --- Draft', entry_type='note', body='Intro.`n`n---`n`nAfter rule --- dashes.', sources=['t'], created_at=now, updated_at=now); assert KBEntry.from_markdown(e.to_markdown(), slug='n') == e; print('roundtrip-ok')"
```

Expected: `roundtrip-ok` (this exact case — `---` in title and body — was the v1 corruption bug; it must survive).

- [ ] **Step 3: Commit**

```bash
git add packages/kb-core
git commit -m "feat(kb-core): OKF KBEntry model with line-anchored frontmatter parsing"
```

---

### Task 3: kb-core — store, FTS5 search, index page

**Tech grounding:** SQLite FTS5 virtual tables (stdlib `sqlite3`, vectorless retrieval per OpenKB philosophy), pathlib filesystem layout `<root>/<type>/<slug>.md`, auto-generated OKF `index.md`.

**Files:**
- Create: `packages/kb-core/src/kb_core/index.py`, `packages/kb-core/src/kb_core/store.py`
- Modify: `packages/kb-core/src/kb_core/__init__.py`

- [ ] **Step 1: Implement `index.py`**

```python
"""SQLite FTS5 full-text index over KB entries (vectorless retrieval)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from kb_core.models import KBEntry


@dataclass
class SearchHit:
    slug: str
    title: str
    snippet: str


class KBIndex:
    def __init__(self, db_path: Path) -> None:
        db_path = Path(db_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS entries "
            "USING fts5(slug UNINDEXED, title, body, tags)"
        )
        self._conn.commit()

    def upsert(self, entry: KBEntry) -> None:
        self._conn.execute("DELETE FROM entries WHERE slug = ?", (entry.slug,))
        self._conn.execute(
            "INSERT INTO entries (slug, title, body, tags) VALUES (?, ?, ?, ?)",
            (entry.slug, entry.title, entry.body, " ".join(entry.tags)),
        )
        self._conn.commit()

    def search(self, query: str, limit: int = 20) -> list[SearchHit]:
        # Quote to disable FTS query operators in user input.
        safe = '"' + query.replace('"', " ") + '"'
        rows = self._conn.execute(
            "SELECT slug, title, snippet(entries, 2, '[', ']', '…', 12) "
            "FROM entries WHERE entries MATCH ? ORDER BY rank LIMIT ?",
            (safe, limit),
        ).fetchall()
        return [SearchHit(slug=r[0], title=r[1], snippet=r[2]) for r in rows]
```

- [ ] **Step 2: Implement `store.py`**

```python
"""Filesystem store: one markdown file per entry, grouped by type, plus index.md."""

from __future__ import annotations

from pathlib import Path

from kb_core.index import KBIndex, SearchHit
from kb_core.models import KBEntry


class KBStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._index = KBIndex(self.root / ".kb" / "index.db")

    def _path(self, entry_type: str, slug: str) -> Path:
        return self.root / entry_type / f"{slug}.md"

    def save(self, entry: KBEntry) -> Path:
        path = self._path(entry.entry_type, entry.slug)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(entry.to_markdown(), encoding="utf-8")
        self._index.upsert(entry)
        return path

    def get(self, slug: str) -> KBEntry | None:
        matches = list(self.root.glob(f"*/{slug}.md"))
        if not matches:
            return None
        return KBEntry.from_markdown(matches[0].read_text(encoding="utf-8"), slug=slug)

    def list(self, entry_type: str | None = None) -> list[KBEntry]:
        pattern = f"{entry_type}/*.md" if entry_type else "*/*.md"
        return [
            KBEntry.from_markdown(p.read_text(encoding="utf-8"), slug=p.stem)
            for p in sorted(self.root.glob(pattern))
            if p.parent.name != ".kb"
        ]

    def upsert_merge(self, entry: KBEntry) -> KBEntry:
        existing = self.get(entry.slug)
        if existing is None:
            self.save(entry)
            return entry
        existing.tags = sorted(set(existing.tags) | set(entry.tags))
        existing.sources = sorted(set(existing.sources) | set(entry.sources))
        if entry.body.strip() and entry.body.strip() not in existing.body:
            existing.body = existing.body.rstrip() + "\n\n" + entry.body.strip()
        existing.updated_at = entry.updated_at or existing.updated_at
        self.save(existing)
        return existing

    def search(self, query: str, limit: int = 20) -> list[SearchHit]:
        return self._index.search(query, limit=limit)

    def rebuild_index_page(self) -> Path:
        lines = ["# Knowledge Base Index", ""]
        by_type: dict[str, list[KBEntry]] = {}
        for entry in self.list():
            by_type.setdefault(entry.entry_type, []).append(entry)
        for entry_type in sorted(by_type):
            lines.append(f"## {entry_type.title()}")
            for entry in sorted(by_type[entry_type], key=lambda e: e.slug):
                lines.append(f"- [[{entry.slug}]] — {entry.title}")
            lines.append("")
        path = self.root / "index.md"
        path.write_text("\n".join(lines), encoding="utf-8")
        return path
```

Replace `packages/kb-core/src/kb_core/__init__.py`:

```python
"""kb_core: reusable OKF-style markdown knowledge base."""

from kb_core.index import KBIndex, SearchHit
from kb_core.models import ENTRY_TYPES, KBEntry, extract_wikilinks, slugify
from kb_core.store import KBStore

__all__ = [
    "ENTRY_TYPES", "KBEntry", "KBIndex", "KBStore", "SearchHit",
    "extract_wikilinks", "slugify",
]
```

- [ ] **Step 3: Smoke-verify**

Run:

```powershell
uv run python -c "import tempfile; from datetime import datetime, timezone; from pathlib import Path; from kb_core import KBEntry, KBStore; root = Path(tempfile.mkdtemp()) / 'kb'; s = KBStore(root); now = datetime.now(timezone.utc); s.save(KBEntry(slug='note-1', title='Kubernetes migration', entry_type='note', body='Migrated to Kubernetes.', sources=['t'], created_at=now, updated_at=now)); hits = s.search('kubernetes'); assert hits and hits[0].slug == 'note-1'; m = s.upsert_merge(KBEntry(slug='note-1', title='Kubernetes migration', entry_type='note', body='Second pass.', tags=['x'], sources=['u'], created_at=now, updated_at=now)); assert sorted(m.sources) == ['t', 'u'] and 'Second pass.' in m.body; s.rebuild_index_page(); assert '[[note-1]]' in (root / 'index.md').read_text(encoding='utf-8'); print('store-ok')"
```

Expected: `store-ok`

- [ ] **Step 4: Commit**

```bash
git add packages/kb-core
git commit -m "feat(kb-core): KBStore with FTS5 search, merge semantics, index page"
```

---

### Task 4: knowledge-extract — schemas, prompt library, OpenAI + fake extractors

**Tech grounding:** OpenAI Python SDK ≥1.66 **Responses API structured outputs** (`client.responses.parse(..., text_format=PydanticModel)` → `.output_parsed`); Pydantic v2 schemas; file-based prompt library (hot-read markdown).

**Files:**
- Create: `packages/knowledge-extract/src/knowledge_extract/schemas.py`, `.../prompts.py`, `.../extractors.py`
- Modify: `packages/knowledge-extract/src/knowledge_extract/__init__.py`

- [ ] **Step 1: Implement `schemas.py`**

```python
"""Pydantic schemas for structured extraction."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProjectMention(BaseModel):
    name: str
    description: str = ""


class ProfessionalUpdate(BaseModel):
    summary: str = Field(description="One-sentence summary of the update")
    skills: list[str] = Field(default_factory=list)
    projects: list[ProjectMention] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    organizations: list[str] = Field(default_factory=list)
```

- [ ] **Step 2: Implement `prompts.py`** — the user-facing prompt control point:

```python
"""File-based prompt library: prompts are markdown files the user owns and edits.

Prompts are re-read from disk on every call, so editing prompts/<name>.md takes
effect on the next request without a restart.
"""

from __future__ import annotations

from pathlib import Path

_VALID_NAME = r"abcdefghijklmnopqrstuvwxyz0123456789_-"


class PromptNotFound(Exception):
    pass


class PromptLibrary:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, name: str) -> Path:
        if not name or any(c not in _VALID_NAME for c in name.lower()):
            raise PromptNotFound(f"invalid prompt name {name!r}")
        return self.root / f"{name}.md"

    def names(self) -> list[str]:
        return sorted(p.stem for p in self.root.glob("*.md"))

    def get(self, name: str) -> str:
        path = self._path(name)
        if not path.exists():
            raise PromptNotFound(f"no prompt named {name!r} in {self.root}")
        return path.read_text(encoding="utf-8")

    def set(self, name: str, content: str) -> None:
        self._path(name).write_text(content, encoding="utf-8")
```

- [ ] **Step 3: Implement `extractors.py`** — OpenAI structured outputs behind a protocol:

```python
"""StructuredExtractor protocol with OpenAI and deterministic fake implementations."""

from __future__ import annotations

from typing import Protocol, TypeVar

from openai import OpenAI
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class ExtractionError(Exception):
    pass


class StructuredExtractor(Protocol):
    def extract(self, text: str, schema: type[T], instructions: str) -> T: ...


class OpenAIStructuredExtractor:
    """Extracts any Pydantic schema from text using OpenAI structured outputs.

    Requires a structured-outputs-capable model (gpt-4o and newer).
    """

    def __init__(self, model: str = "gpt-4o", client: OpenAI | None = None) -> None:
        self._client = client or OpenAI()
        self._model = model

    def extract(self, text: str, schema: type[T], instructions: str) -> T:
        response = self._client.responses.parse(
            model=self._model,
            instructions=instructions,
            input=text,
            text_format=schema,
        )
        parsed = response.output_parsed
        if parsed is None:
            raise ExtractionError(
                f"model {self._model} returned no parsed {schema.__name__} "
                f"(refusal or incomplete output)"
            )
        return parsed


class FakeStructuredExtractor:
    """Deterministic extractor for tests and keyless demo mode."""

    def __init__(self, responses: dict[type[BaseModel], BaseModel]) -> None:
        self._responses = responses

    def extract(self, text: str, schema: type[T], instructions: str) -> T:
        try:
            return self._responses[schema]  # type: ignore[return-value]
        except KeyError as exc:
            raise KeyError(f"FakeStructuredExtractor has no canned response for {schema}") from exc
```

- [ ] **Step 4: Update `__init__.py`**

```python
"""knowledge_extract: reusable structured extraction into KB entries."""

from knowledge_extract.extractors import (
    ExtractionError,
    FakeStructuredExtractor,
    OpenAIStructuredExtractor,
    StructuredExtractor,
)
from knowledge_extract.prompts import PromptLibrary, PromptNotFound
from knowledge_extract.schemas import ProfessionalUpdate, ProjectMention

__all__ = [
    "ExtractionError",
    "FakeStructuredExtractor",
    "OpenAIStructuredExtractor",
    "ProfessionalUpdate",
    "ProjectMention",
    "PromptLibrary",
    "PromptNotFound",
    "StructuredExtractor",
]
```

- [ ] **Step 5: Smoke-verify** (fake path + prompt library; the OpenAI path is exercised manually/optionally — never in CI):

```powershell
uv run python -c "from pathlib import Path; from knowledge_extract import FakeStructuredExtractor, ProfessionalUpdate, PromptLibrary; lib = PromptLibrary(Path('prompts')); assert 'explicitly mentioned' in lib.get('professional_update'); assert sorted(lib.names()) == ['cv_profile', 'professional_update']; fx = FakeStructuredExtractor({ProfessionalUpdate: ProfessionalUpdate(summary='x')}); assert fx.extract('t', ProfessionalUpdate, lib.get('professional_update')).summary == 'x'; print('extract-ok')"
```

Expected: `extract-ok`

Optional live check (needs `OPENAI_API_KEY` exported; do not automate):

```powershell
uv run python -c "from knowledge_extract import OpenAIStructuredExtractor, ProfessionalUpdate; print(OpenAIStructuredExtractor().extract('This week I shipped the payments migration using Python.', ProfessionalUpdate, 'Extract professional facts.'))"
```

- [ ] **Step 6: Commit**

```bash
git add packages/knowledge-extract
git commit -m "feat(knowledge-extract): OpenAI structured extraction with editable prompt library"
```

---

### Task 5: knowledge-extract — mapping updates onto the KB graph

**Tech grounding:** kb-core `KBEntry`/`slugify`; OKF wikilink graph construction (note ↔ skill/project/org entries).

**Files:**
- Create: `packages/knowledge-extract/src/knowledge_extract/mapping.py`
- Modify: `packages/knowledge-extract/src/knowledge_extract/__init__.py`

- [ ] **Step 1: Implement `mapping.py`**

```python
"""Map extracted ProfessionalUpdate objects onto kb_core entries with wikilinks."""

from __future__ import annotations

from datetime import datetime, timezone

from kb_core import KBEntry, slugify

from knowledge_extract.schemas import ProfessionalUpdate


def update_to_entries(
    update: ProfessionalUpdate,
    source: str,
    transcript: str | None = None,
) -> list[KBEntry]:
    now = datetime.now(timezone.utc)
    skill_slugs = [f"skill-{slugify(s)}" for s in update.skills]
    project_slugs = [f"project-{slugify(p.name)}" for p in update.projects]
    note_slug = f"note-{now:%Y%m%d%H%M%S}-{slugify(update.summary)[:40]}".rstrip("-")

    body_parts = [update.summary]
    if transcript:
        body_parts += ["", "## Transcript", transcript]
    if update.achievements:
        body_parts += ["", "## Achievements"] + [f"- {a}" for a in update.achievements]
    if skill_slugs:
        body_parts += ["", "## Skills", ", ".join(f"[[{s}]]" for s in skill_slugs)]
    if project_slugs:
        body_parts += ["", "## Projects", ", ".join(f"[[{s}]]" for s in project_slugs)]

    entries = [
        KBEntry(
            slug=note_slug, title=update.summary[:80], entry_type="note",
            body="\n".join(body_parts), tags=["professional-update"],
            sources=[source], created_at=now, updated_at=now,
        )
    ]
    for name, slug in zip(update.skills, skill_slugs):
        entries.append(KBEntry(
            slug=slug, title=name, entry_type="skill",
            body=f"Mentioned in [[{note_slug}]].", tags=["skill"],
            sources=[source], created_at=now, updated_at=now,
        ))
    for project, slug in zip(update.projects, project_slugs):
        body = (project.description.strip() + f"\n\nMentioned in [[{note_slug}]].").strip()
        entries.append(KBEntry(
            slug=slug, title=project.name, entry_type="project",
            body=body, tags=["project"], sources=[source], created_at=now, updated_at=now,
        ))
    for org in update.organizations:
        entries.append(KBEntry(
            slug=f"org-{slugify(org)}", title=org, entry_type="organization",
            body=f"Mentioned in [[{note_slug}]].", tags=["organization"],
            sources=[source], created_at=now, updated_at=now,
        ))
    return entries
```

Add to `__init__.py` imports/`__all__`: `from knowledge_extract.mapping import update_to_entries` and `"update_to_entries"`.

- [ ] **Step 2: Smoke-verify**

```powershell
uv run python -c "from knowledge_extract import ProfessionalUpdate, ProjectMention, update_to_entries; es = update_to_entries(ProfessionalUpdate(summary='Completed the gateway migration', skills=['Python'], projects=[ProjectMention(name='Gateway Migration')], achievements=['Zero downtime'], organizations=['Acme']), source='voice-note:t', transcript='raw text'); slugs = {e.slug for e in es}; assert 'skill-python' in slugs and 'project-gateway-migration' in slugs and 'org-acme' in slugs; note = [e for e in es if e.entry_type == 'note'][0]; assert '[[skill-python]]' in note.body and 'raw text' in note.body; print('mapping-ok')"
```

Expected: `mapping-ok`

- [ ] **Step 3: Commit**

```bash
git add packages/knowledge-extract
git commit -m "feat(knowledge-extract): map updates onto wikilinked KB entries"
```

---

### Task 6: voice-transcribe — probing, 2-minute enforcement, faster-whisper

**Tech grounding:** PyAV (`av.open`, `container.duration` in AV_TIME_BASE µs) for duration probing without external ffmpeg; faster-whisper (`WhisperModel`, `vad_filter=True`, model size/device/compute_type configurable — `large-v3` prod, `tiny` tests).

**Files:**
- Create: `packages/voice-transcribe/src/voice_transcribe/audio.py`, `.../transcriber.py`
- Modify: `packages/voice-transcribe/src/voice_transcribe/__init__.py`

- [ ] **Step 1: Implement `audio.py`**

```python
"""Container probing and duration enforcement via PyAV (no external ffmpeg needed)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import av


class DurationLimitExceeded(Exception):
    pass


@dataclass
class AudioInfo:
    duration_s: float
    format_name: str


def probe(path: Path) -> AudioInfo:
    with av.open(str(path)) as container:
        if container.duration is not None:
            duration = container.duration / 1_000_000  # AV_TIME_BASE microseconds
        else:
            duration = max(
                (float(s.duration * s.time_base) for s in container.streams if s.duration),
                default=0.0,
            )
        return AudioInfo(duration_s=duration, format_name=container.format.name)


def validate_duration(path: Path, max_seconds: float = 120.0) -> AudioInfo:
    info = probe(path)
    if info.duration_s > max_seconds:
        raise DurationLimitExceeded(
            f"audio is {info.duration_s:.1f}s; the maximum allowed is {max_seconds:.0f}s"
        )
    return info
```

- [ ] **Step 2: Implement `transcriber.py`**

```python
"""faster-whisper wrapper: validates duration first, then transcribes."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from faster_whisper import WhisperModel

from voice_transcribe.audio import validate_duration


@dataclass
class Segment:
    start: float
    end: float
    text: str


@dataclass
class Transcription:
    text: str
    language: str
    duration_s: float
    segments: list[Segment] = field(default_factory=list)


class Transcriber:
    def __init__(
        self,
        model_size: str = "large-v3",
        device: str = "auto",
        compute_type: str = "default",
    ) -> None:
        self._model = WhisperModel(model_size, device=device, compute_type=compute_type)

    def transcribe(self, path: Path, max_seconds: float = 120.0) -> Transcription:
        info = validate_duration(path, max_seconds=max_seconds)
        raw_segments, whisper_info = self._model.transcribe(str(path), vad_filter=True)
        segments = [Segment(start=s.start, end=s.end, text=s.text.strip()) for s in raw_segments]
        text = " ".join(s.text for s in segments).strip()
        return Transcription(
            text=text,
            language=whisper_info.language,
            duration_s=info.duration_s,
            segments=segments,
        )
```

`__init__.py`:

```python
"""voice_transcribe: reusable audio validation + faster-whisper transcription."""

from voice_transcribe.audio import AudioInfo, DurationLimitExceeded, probe, validate_duration
from voice_transcribe.transcriber import Segment, Transcriber, Transcription

__all__ = [
    "AudioInfo", "DurationLimitExceeded", "Segment", "Transcriber", "Transcription",
    "probe", "validate_duration",
]
```

- [ ] **Step 3: Smoke-verify duration enforcement** (pure-Python tone WAV; no model download here — real transcription is proven in the E2E suite):

```powershell
uv run python -c "import math, struct, tempfile, wave; from pathlib import Path; from voice_transcribe import DurationLimitExceeded, probe, validate_duration; p = Path(tempfile.mkdtemp()) / 't.wav'; w = wave.open(str(p), 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(b''.join(struct.pack('<h', int(32767*0.3*math.sin(2*math.pi*440*i/16000))) for i in range(16000*130))); w.close(); assert 129 < probe(p).duration_s < 131; import sys; e = None
try:
    validate_duration(p, max_seconds=120.0)
except DurationLimitExceeded as exc:
    e = exc
assert e is not None and '120' in str(e); print('audio-ok')"
```

(If the one-liner is awkward in PowerShell, write it as a throwaway script in the scratchpad and run it — the assertion outcomes are what matter: probe ≈130 s, `DurationLimitExceeded` raised at 120 s cap.)

Expected: `audio-ok`

- [ ] **Step 4: Commit**

```bash
git add packages/voice-transcribe
git commit -m "feat(voice-transcribe): PyAV duration enforcement and faster-whisper wrapper"
```

---

### Task 7: doc-ingest — CV conversion and profile mapping

**Tech grounding:** markitdown (`MarkItDown().convert(...)` — pdfminer-six for PDF, mammoth for DOCX under the hood); Pydantic CVProfile schema; kb-core mapping.

**Files:**
- Create: `packages/doc-ingest/src/doc_ingest/convert.py`, `.../cv.py`
- Modify: `packages/doc-ingest/src/doc_ingest/__init__.py`

- [ ] **Step 1: Implement `convert.py`**

```python
"""Document → markdown conversion via markitdown (PDF and DOCX)."""

from __future__ import annotations

from pathlib import Path

from markitdown import MarkItDown

SUPPORTED_SUFFIXES = {".pdf", ".docx"}


class UnsupportedDocumentType(Exception):
    pass


def convert_to_markdown(path: Path) -> str:
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise UnsupportedDocumentType(
            f"{suffix or 'file without extension'} is not supported; "
            f"upload a PDF or DOCX (convert legacy .doc files to .docx first)"
        )
    result = MarkItDown().convert(str(path))
    return result.text_content
```

- [ ] **Step 2: Implement `cv.py`**

```python
"""CV profile schema and mapping to KB entries."""

from __future__ import annotations

from datetime import datetime, timezone

from kb_core import KBEntry, slugify
from pydantic import BaseModel, Field


class ExperienceItem(BaseModel):
    title: str
    organization: str
    start: str | None = None
    end: str | None = None
    description: str = ""


class EducationItem(BaseModel):
    institution: str
    degree: str | None = None


class CVProfile(BaseModel):
    name: str
    headline: str = ""
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experiences: list[ExperienceItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)


def cv_to_entries(profile: CVProfile, source: str) -> list[KBEntry]:
    now = datetime.now(timezone.utc)
    person_slug = f"person-{slugify(profile.name)}"
    skill_slugs = [f"skill-{slugify(s)}" for s in profile.skills]
    experience_slugs = [
        f"experience-{slugify(x.organization)}-{slugify(x.title)}" for x in profile.experiences
    ]

    body_parts = [profile.headline or profile.name]
    if profile.summary:
        body_parts += ["", profile.summary]
    if experience_slugs:
        body_parts += ["", "## Experience"] + [f"- [[{s}]]" for s in experience_slugs]
    if skill_slugs:
        body_parts += ["", "## Skills", ", ".join(f"[[{s}]]" for s in skill_slugs)]
    if profile.education:
        body_parts += ["", "## Education"] + [
            f"- {e.institution}" + (f" — {e.degree}" if e.degree else "") for e in profile.education
        ]

    entries = [
        KBEntry(
            slug=person_slug, title=profile.name, entry_type="person",
            body="\n".join(body_parts), tags=["cv"], sources=[source],
            created_at=now, updated_at=now,
        )
    ]
    for name, slug in zip(profile.skills, skill_slugs):
        entries.append(KBEntry(
            slug=slug, title=name, entry_type="skill",
            body=f"Listed on the CV of [[{person_slug}]].", tags=["skill", "cv"],
            sources=[source], created_at=now, updated_at=now,
        ))
    for experience, slug in zip(profile.experiences, experience_slugs):
        period = f"{experience.start or '?'} – {experience.end or 'present'}"
        body = (
            f"{experience.title} at {experience.organization} ({period}).\n\n"
            f"{experience.description}"
        ).strip()
        entries.append(KBEntry(
            slug=slug, title=f"{experience.title} @ {experience.organization}",
            entry_type="experience", body=body + f"\n\nProfile: [[{person_slug}]].",
            tags=["experience", "cv"], sources=[source], created_at=now, updated_at=now,
        ))
    return entries
```

`__init__.py`:

```python
"""doc_ingest: reusable document conversion and CV profile extraction."""

from doc_ingest.convert import SUPPORTED_SUFFIXES, UnsupportedDocumentType, convert_to_markdown
from doc_ingest.cv import CVProfile, EducationItem, ExperienceItem, cv_to_entries

__all__ = [
    "CVProfile", "EducationItem", "ExperienceItem",
    "SUPPORTED_SUFFIXES", "UnsupportedDocumentType",
    "convert_to_markdown", "cv_to_entries",
]
```

Note: the CV extraction *prompt* lives in `prompts/cv_profile.md` (Task 1), not in this package — the server wires prompt + schema + extractor together.

- [ ] **Step 3: Smoke-verify** (docx generated with python-docx dev dep):

```powershell
uv run python -c "import tempfile; from pathlib import Path; import docx; from doc_ingest import convert_to_markdown, UnsupportedDocumentType; d = docx.Document(); d.add_heading('Vivek Subramanian', level=1); d.add_paragraph('Skills: Python, Kubernetes'); p = Path(tempfile.mkdtemp()) / 'cv.docx'; d.save(str(p)); md = convert_to_markdown(p); assert 'Vivek' in md and 'Kubernetes' in md; err = None
try:
    convert_to_markdown(p.with_suffix('.doc'))
except UnsupportedDocumentType as exc:
    err = exc
assert err is not None; print('docingest-ok')"
```

Expected: `docingest-ok`

- [ ] **Step 4: Commit**

```bash
git add packages/doc-ingest
git commit -m "feat(doc-ingest): markitdown conversion and CV profile mapping"
```

---

### Task 8: profile-ingest — GitHub client

**Tech grounding:** httpx sync client against the GitHub REST v3 API (`/users/{u}`, `/users/{u}/repos?sort=pushed`, `/repos/{u}/{r}/languages`, `/repos/{u}/{r}/readme` with `Accept: application/vnd.github.raw+json`); optional bearer token for rate limits; forks skipped; max 10 repos; README excerpt capped at 2000 chars.

**Files:**
- Create: `packages/profile-ingest/src/profile_ingest/github.py`
- Modify: `packages/profile-ingest/src/profile_ingest/__init__.py`

- [ ] **Step 1: Implement `github.py`**

```python
"""GitHub REST ingestion: profile + top repos + languages + README excerpts."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
from kb_core import KBEntry, slugify
from pydantic import BaseModel, Field

README_EXCERPT_CHARS = 2000
MAX_REPOS = 10


class RepoInfo(BaseModel):
    name: str
    description: str = ""
    stars: int = 0
    topics: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    readme_excerpt: str = ""


class GitHubProfile(BaseModel):
    username: str
    name: str = ""
    bio: str = ""
    repos: list[RepoInfo] = Field(default_factory=list)


class GitHubClient:
    def __init__(self, token: str | None = None, base_url: str = "https://api.github.com"):
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "resumeKB"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._client = httpx.Client(base_url=base_url, headers=headers, timeout=30.0)

    def fetch_profile(self, username: str) -> GitHubProfile:
        user = self._get_json(f"/users/{username}")
        raw_repos = self._get_json(
            f"/users/{username}/repos", params={"sort": "pushed", "per_page": 30}
        )
        repos: list[RepoInfo] = []
        for raw in raw_repos:
            if raw.get("fork"):
                continue
            repos.append(RepoInfo(
                name=raw["name"],
                description=raw.get("description") or "",
                stars=raw.get("stargazers_count", 0),
                topics=raw.get("topics") or [],
                languages=self._languages(username, raw["name"]),
                readme_excerpt=self._readme(username, raw["name"]),
            ))
            if len(repos) >= MAX_REPOS:
                break
        return GitHubProfile(
            username=username, name=user.get("name") or "", bio=user.get("bio") or "", repos=repos
        )

    def _get_json(self, path: str, params: dict | None = None):
        response = self._client.get(path, params=params)
        response.raise_for_status()
        return response.json()

    def _languages(self, username: str, repo: str) -> list[str]:
        try:
            return list(self._get_json(f"/repos/{username}/{repo}/languages").keys())
        except httpx.HTTPStatusError:
            return []

    def _readme(self, username: str, repo: str) -> str:
        response = self._client.get(
            f"/repos/{username}/{repo}/readme",
            headers={"Accept": "application/vnd.github.raw+json"},
        )
        if response.status_code != 200:
            return ""
        return response.text[:README_EXCERPT_CHARS]


def github_to_entries(profile: GitHubProfile) -> list[KBEntry]:
    now = datetime.now(timezone.utc)
    source = f"github:{profile.username}"
    source_slug = f"source-github-{slugify(profile.username)}"
    repo_slugs = [f"project-{slugify(r.name)}" for r in profile.repos]

    all_languages: list[str] = []
    for repo in profile.repos:
        for lang in repo.languages:
            if lang not in all_languages:
                all_languages.append(lang)

    body_parts = [f"GitHub profile of {profile.name or profile.username}."]
    if profile.bio:
        body_parts += ["", profile.bio]
    if repo_slugs:
        body_parts += ["", "## Repositories"] + [f"- [[{s}]]" for s in repo_slugs]

    entries = [
        KBEntry(
            slug=source_slug, title=f"GitHub: {profile.username}", entry_type="source",
            body="\n".join(body_parts), tags=["github"], sources=[source],
            created_at=now, updated_at=now,
        )
    ]
    for repo, slug in zip(profile.repos, repo_slugs):
        body = "\n".join(filter(None, [
            repo.description,
            f"Languages: {', '.join(repo.languages)}" if repo.languages else "",
            f"Topics: {', '.join(repo.topics)}" if repo.topics else "",
            f"Stars: {repo.stars}",
            "",
            repo.readme_excerpt,
            "",
            f"Source: [[{source_slug}]].",
        ]))
        entries.append(KBEntry(
            slug=slug, title=repo.name, entry_type="project", body=body,
            tags=["project", "github"], sources=[source], created_at=now, updated_at=now,
        ))
    for lang in all_languages:
        entries.append(KBEntry(
            slug=f"skill-{slugify(lang)}", title=lang, entry_type="skill",
            body=f"Used in repositories on [[{source_slug}]].", tags=["skill", "github"],
            sources=[source], created_at=now, updated_at=now,
        ))
    return entries
```

`__init__.py`:

```python
"""profile_ingest: reusable GitHub and LinkedIn-export ingestion."""

from profile_ingest.github import GitHubClient, GitHubProfile, RepoInfo, github_to_entries

__all__ = ["GitHubClient", "GitHubProfile", "RepoInfo", "github_to_entries"]
```

- [ ] **Step 2: Smoke-verify the mapping** (network-free; the client itself is proven E2E with respx in Task 11):

```powershell
uv run python -c "from profile_ingest import GitHubProfile, RepoInfo, github_to_entries; es = github_to_entries(GitHubProfile(username='v', name='V', repos=[RepoInfo(name='payments-svc', languages=['Python'])])); slugs = {e.slug for e in es}; assert {'source-github-v', 'project-payments-svc', 'skill-python'} <= slugs; print('github-ok')"
```

Expected: `github-ok`

- [ ] **Step 3: Commit**

```bash
git add packages/profile-ingest
git commit -m "feat(profile-ingest): GitHub REST client and KB mapping"
```

---

### Task 9: profile-ingest — LinkedIn data-export parser

**Tech grounding:** stdlib `zipfile` + `csv.DictReader` (utf-8-sig for BOM) over the official LinkedIn data-export ZIP (`Profile.csv`, `Positions.csv`, `Skills.csv`, `Education.csv`) — ToS-safe, no scraping.

**Files:**
- Create: `packages/profile-ingest/src/profile_ingest/linkedin.py`
- Modify: `packages/profile-ingest/src/profile_ingest/__init__.py`

- [ ] **Step 1: Implement `linkedin.py`**

```python
"""LinkedIn official data-export ZIP parser (ToS-safe: no scraping)."""

from __future__ import annotations

import csv
import io
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from kb_core import KBEntry, slugify
from pydantic import BaseModel, Field


class LinkedInPosition(BaseModel):
    organization: str
    title: str
    description: str = ""
    start: str = ""
    end: str = ""


class LinkedInEducation(BaseModel):
    institution: str
    degree: str = ""


class LinkedInProfile(BaseModel):
    name: str = ""
    headline: str = ""
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    positions: list[LinkedInPosition] = Field(default_factory=list)
    education: list[LinkedInEducation] = Field(default_factory=list)


def _read_csv(archive: zipfile.ZipFile, filename: str) -> list[dict[str, str]]:
    for member in archive.namelist():
        if member.split("/")[-1].lower() == filename.lower():
            with archive.open(member) as fh:
                text = io.TextIOWrapper(fh, encoding="utf-8-sig")
                return [dict(row) for row in csv.DictReader(text)]
    return []


def parse_linkedin_export(zip_path: Path) -> LinkedInProfile:
    with zipfile.ZipFile(zip_path) as archive:
        profile_rows = _read_csv(archive, "Profile.csv")
        positions_rows = _read_csv(archive, "Positions.csv")
        skills_rows = _read_csv(archive, "Skills.csv")
        education_rows = _read_csv(archive, "Education.csv")

    name = headline = summary = ""
    if profile_rows:
        row = profile_rows[0]
        name = f"{row.get('First Name', '')} {row.get('Last Name', '')}".strip()
        headline = row.get("Headline", "") or ""
        summary = row.get("Summary", "") or ""

    return LinkedInProfile(
        name=name,
        headline=headline,
        summary=summary,
        skills=[r["Name"] for r in skills_rows if r.get("Name")],
        positions=[
            LinkedInPosition(
                organization=r.get("Company Name", "") or "",
                title=r.get("Title", "") or "",
                description=r.get("Description", "") or "",
                start=r.get("Started On", "") or "",
                end=r.get("Finished On", "") or "",
            )
            for r in positions_rows
            if r.get("Company Name")
        ],
        education=[
            LinkedInEducation(
                institution=r.get("School Name", "") or "",
                degree=r.get("Degree Name", "") or "",
            )
            for r in education_rows
            if r.get("School Name")
        ],
    )


def linkedin_to_entries(profile: LinkedInProfile) -> list[KBEntry]:
    now = datetime.now(timezone.utc)
    source = "linkedin-export"
    person_slug = f"person-{slugify(profile.name)}" if profile.name else "person-linkedin"
    position_slugs = [
        f"experience-{slugify(p.organization)}-{slugify(p.title)}" for p in profile.positions
    ]
    skill_slugs = [f"skill-{slugify(s)}" for s in profile.skills]

    body_parts = [profile.headline or profile.name or "LinkedIn profile"]
    if profile.summary:
        body_parts += ["", profile.summary]
    if position_slugs:
        body_parts += ["", "## Experience"] + [f"- [[{s}]]" for s in position_slugs]
    if skill_slugs:
        body_parts += ["", "## Skills", ", ".join(f"[[{s}]]" for s in skill_slugs)]
    if profile.education:
        body_parts += ["", "## Education"] + [
            f"- {e.institution}" + (f" — {e.degree}" if e.degree else "") for e in profile.education
        ]

    entries = [
        KBEntry(
            slug=person_slug, title=profile.name or "LinkedIn profile", entry_type="person",
            body="\n".join(body_parts), tags=["linkedin"], sources=[source],
            created_at=now, updated_at=now,
        )
    ]
    for position, slug in zip(profile.positions, position_slugs):
        period = f"{position.start or '?'} – {position.end or 'present'}"
        body = (
            f"{position.title} at {position.organization} ({period}).\n\n"
            f"{position.description}\n\nProfile: [[{person_slug}]]."
        ).strip()
        entries.append(KBEntry(
            slug=slug, title=f"{position.title} @ {position.organization}",
            entry_type="experience", body=body, tags=["experience", "linkedin"],
            sources=[source], created_at=now, updated_at=now,
        ))
    for name, slug in zip(profile.skills, skill_slugs):
        entries.append(KBEntry(
            slug=slug, title=name, entry_type="skill",
            body=f"Listed on LinkedIn profile [[{person_slug}]].", tags=["skill", "linkedin"],
            sources=[source], created_at=now, updated_at=now,
        ))
    return entries
```

Update `__init__.py`:

```python
"""profile_ingest: reusable GitHub and LinkedIn-export ingestion."""

from profile_ingest.github import GitHubClient, GitHubProfile, RepoInfo, github_to_entries
from profile_ingest.linkedin import (
    LinkedInEducation,
    LinkedInPosition,
    LinkedInProfile,
    linkedin_to_entries,
    parse_linkedin_export,
)

__all__ = [
    "GitHubClient", "GitHubProfile", "RepoInfo", "github_to_entries",
    "LinkedInEducation", "LinkedInPosition", "LinkedInProfile",
    "linkedin_to_entries", "parse_linkedin_export",
]
```

- [ ] **Step 2: Smoke-verify**

```powershell
uv run python -c "import tempfile, zipfile; from pathlib import Path; from profile_ingest import parse_linkedin_export, linkedin_to_entries; p = Path(tempfile.mkdtemp()) / 'x.zip'
z = zipfile.ZipFile(p, 'w'); z.writestr('Profile.csv', 'First Name,Last Name,Headline,Summary\nVivek,Subramanian,Engineer,Builds.\n'); z.writestr('Skills.csv', 'Name\nGo\n'); z.close(); prof = parse_linkedin_export(p); assert prof.name == 'Vivek Subramanian' and prof.skills == ['Go']; es = linkedin_to_entries(prof); assert {'person-vivek-subramanian', 'skill-go'} <= {e.slug for e in es}; print('linkedin-ok')"
```

Expected: `linkedin-ok`

- [ ] **Step 3: Commit**

```bash
git add packages/profile-ingest
git commit -m "feat(profile-ingest): LinkedIn data-export ZIP parser"
```

---

### Task 10: Server — settings (.env), fakes, app factory with all endpoints

**Tech grounding:** FastAPI app-factory pattern with dependency injection (extractor/transcriber injectable for tests), python-dotenv (`load_dotenv()` reads the existing repo `.env`), StaticFiles mount, lazy whisper loading, PromptLibrary wiring, temp-file upload handling.

**Files:**
- Create: `apps/server/src/resume_kb_server/settings.py`, `.../fakes.py`, `.../app.py`
- Create: `apps/server/src/resume_kb_server/static/index.html` (placeholder — real UI in Task 12)

- [ ] **Step 1: Implement `settings.py`**

```python
"""Environment-driven settings (reads the repo .env via python-dotenv)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # no-op if .env is absent; existing env vars win


@dataclass
class Settings:
    kb_root: Path = field(default_factory=lambda: Path(os.environ.get("KB_ROOT", "./kb")))
    prompts_root: Path = field(
        default_factory=lambda: Path(os.environ.get("PROMPTS_ROOT", "./prompts"))
    )
    extractor_backend: str = field(
        default_factory=lambda: os.environ.get("KB_EXTRACTOR", "openai")  # "openai" | "fake"
    )
    openai_model: str = field(default_factory=lambda: os.environ.get("OPENAI_MODEL", "gpt-4o"))
    whisper_model: str = field(default_factory=lambda: os.environ.get("WHISPER_MODEL", "large-v3"))
    whisper_device: str = field(default_factory=lambda: os.environ.get("WHISPER_DEVICE", "auto"))
    whisper_compute_type: str = field(
        default_factory=lambda: os.environ.get("WHISPER_COMPUTE", "default")
    )
    max_note_seconds: float = 120.0
    github_token: str | None = field(default_factory=lambda: os.environ.get("GITHUB_TOKEN"))
```

- [ ] **Step 2: Implement `fakes.py`**

```python
"""Canned extractor responses — used by tests and by KB_EXTRACTOR=fake demo mode."""

from doc_ingest import CVProfile, EducationItem, ExperienceItem
from knowledge_extract import FakeStructuredExtractor, ProfessionalUpdate, ProjectMention

FAKE_UPDATE = ProfessionalUpdate(
    summary="Completed the payment gateway migration",
    skills=["Python", "Kubernetes"],
    projects=[
        ProjectMention(
            name="Payment Gateway Migration",
            description="Migrated payments to a new gateway with zero downtime.",
        )
    ],
    achievements=["Zero-downtime cutover"],
    organizations=[],
)

FAKE_CV = CVProfile(
    name="Vivek Subramanian",
    headline="Senior Backend Engineer",
    summary="Backend engineer focused on payments infrastructure.",
    skills=["Python", "Kubernetes", "PostgreSQL"],
    experiences=[
        ExperienceItem(
            title="Senior Engineer", organization="Acme Corp",
            start="2022-01", end=None, description="Led the payments platform team.",
        )
    ],
    education=[EducationItem(institution="IIT Madras", degree="B.Tech")],
)


def build_fake_extractor() -> FakeStructuredExtractor:
    return FakeStructuredExtractor({ProfessionalUpdate: FAKE_UPDATE, CVProfile: FAKE_CV})
```

- [ ] **Step 3: Implement `app.py`**

```python
"""FastAPI app factory composing all resumeKB packages."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from doc_ingest import CVProfile, UnsupportedDocumentType, convert_to_markdown, cv_to_entries
from kb_core import KBStore
from knowledge_extract import (
    ExtractionError,
    OpenAIStructuredExtractor,
    ProfessionalUpdate,
    PromptLibrary,
    PromptNotFound,
    StructuredExtractor,
    update_to_entries,
)
from profile_ingest import (
    GitHubClient,
    github_to_entries,
    linkedin_to_entries,
    parse_linkedin_export,
)
from voice_transcribe import DurationLimitExceeded, Transcriber

from resume_kb_server.fakes import build_fake_extractor
from resume_kb_server.settings import Settings

STATIC_DIR = Path(__file__).parent / "static"

UPDATE_PROMPT = "professional_update"
CV_PROMPT = "cv_profile"


class GitHubIngestRequest(BaseModel):
    username: str


class PromptUpdateRequest(BaseModel):
    content: str


def _build_extractor(settings: Settings) -> StructuredExtractor:
    if settings.extractor_backend == "fake":
        return build_fake_extractor()
    return OpenAIStructuredExtractor(model=settings.openai_model)


def create_app(
    settings: Settings | None = None,
    extractor: StructuredExtractor | None = None,
    transcriber=None,
) -> FastAPI:
    settings = settings or Settings()
    extractor = extractor or _build_extractor(settings)
    store = KBStore(settings.kb_root)
    prompts = PromptLibrary(settings.prompts_root)
    app = FastAPI(title="resumeKB")

    state = {"transcriber": transcriber}

    def get_transcriber():
        if state["transcriber"] is None:  # lazy: don't load whisper unless audio arrives
            state["transcriber"] = Transcriber(
                model_size=settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
            )
        return state["transcriber"]

    def _save_upload(upload: UploadFile) -> Path:
        suffix = Path(upload.filename or "upload.bin").suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(upload.file, tmp)
            return Path(tmp.name)

    def _persist(entries) -> list[str]:
        saved = [store.upsert_merge(e) for e in entries]
        store.rebuild_index_page()
        return [e.slug for e in saved]

    @app.post("/api/notes")
    def create_note(audio: UploadFile = File(...)):
        tmp = _save_upload(audio)
        try:
            try:
                result = get_transcriber().transcribe(tmp, max_seconds=settings.max_note_seconds)
            except DurationLimitExceeded as exc:
                raise HTTPException(status_code=422, detail=str(exc))
            if not result.text.strip():
                raise HTTPException(status_code=422, detail="No speech detected in the recording")
            try:
                update = extractor.extract(
                    result.text, ProfessionalUpdate, prompts.get(UPDATE_PROMPT)
                )
            except ExtractionError as exc:
                raise HTTPException(status_code=502, detail=str(exc))
            entries = update_to_entries(
                update, source=f"voice-note:{audio.filename}", transcript=result.text
            )
            slugs = _persist(entries)
            return {
                "transcript": result.text,
                "language": result.language,
                "duration_s": result.duration_s,
                "entries": slugs,
            }
        finally:
            tmp.unlink(missing_ok=True)

    @app.post("/api/documents")
    def upload_cv(document: UploadFile = File(...)):
        tmp = _save_upload(document)
        try:
            try:
                markdown = convert_to_markdown(tmp)
            except UnsupportedDocumentType as exc:
                raise HTTPException(status_code=422, detail=str(exc))
            try:
                profile = extractor.extract(markdown, CVProfile, prompts.get(CV_PROMPT))
            except ExtractionError as exc:
                raise HTTPException(status_code=502, detail=str(exc))
            slugs = _persist(cv_to_entries(profile, source=f"cv:{document.filename}"))
            return {"name": profile.name, "entries": slugs}
        finally:
            tmp.unlink(missing_ok=True)

    @app.post("/api/sources/github")
    def ingest_github(request: GitHubIngestRequest):
        profile = GitHubClient(token=settings.github_token).fetch_profile(request.username)
        slugs = _persist(github_to_entries(profile))
        return {"username": profile.username, "repos": len(profile.repos), "entries": slugs}

    @app.post("/api/sources/linkedin")
    def ingest_linkedin(export: UploadFile = File(...)):
        tmp = _save_upload(export)
        try:
            profile = parse_linkedin_export(tmp)
            slugs = _persist(linkedin_to_entries(profile))
            return {"name": profile.name, "entries": slugs}
        finally:
            tmp.unlink(missing_ok=True)

    @app.get("/api/kb/search")
    def search(q: str):
        return [
            {"slug": h.slug, "title": h.title, "snippet": h.snippet}
            for h in store.search(q)
        ]

    @app.get("/api/kb/entries")
    def list_entries(type: str | None = None):
        return [
            {"slug": e.slug, "title": e.title, "entry_type": e.entry_type, "tags": e.tags}
            for e in store.list(entry_type=type)
        ]

    @app.get("/api/kb/entries/{slug}")
    def get_entry(slug: str):
        entry = store.get(slug)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"no entry {slug!r}")
        return {
            "slug": entry.slug, "title": entry.title, "entry_type": entry.entry_type,
            "body": entry.body, "tags": entry.tags, "sources": entry.sources,
        }

    @app.get("/api/prompts")
    def list_prompts():
        return {"prompts": prompts.names()}

    @app.get("/api/prompts/{name}")
    def get_prompt(name: str):
        try:
            return {"name": name, "content": prompts.get(name)}
        except PromptNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc))

    @app.put("/api/prompts/{name}")
    def put_prompt(name: str, request: PromptUpdateRequest):
        try:
            prompts._path(name)  # validates the name
        except PromptNotFound as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if name not in prompts.names():
            raise HTTPException(status_code=404, detail=f"no prompt named {name!r}")
        prompts.set(name, request.content)
        return {"name": name, "content": prompts.get(name)}

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
    return app
```

- [ ] **Step 4: Placeholder `static/index.html`** (replaced in Task 12):

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>resumeKB</title></head>
<body><h1>resumeKB</h1><p>UI arrives in Task 12.</p></body></html>
```

- [ ] **Step 5: Smoke-verify**

```powershell
uv run python -c "from fastapi.testclient import TestClient; from resume_kb_server.app import create_app; from resume_kb_server.settings import Settings; import tempfile; from pathlib import Path; s = Settings(kb_root=Path(tempfile.mkdtemp()) / 'kb', extractor_backend='fake'); c = TestClient(create_app(s)); r = c.get('/api/prompts'); assert r.status_code == 200 and 'professional_update' in r.json()['prompts']; r2 = c.get('/api/kb/entries'); assert r2.status_code == 200 and r2.json() == []; print('server-ok')"
```

Expected: `server-ok`

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat(server): app factory with voice/CV/source ingestion, KB, and prompts APIs"
```

---

### Task 11: E2E test suite — API level (the primary quality gate)

**Tech grounding:** pytest + FastAPI `TestClient` (httpx); real synthesized speech via Windows SAPI (`System.Speech` through PowerShell); real faster-whisper `tiny` transcription; respx for GitHub network mocking; python-docx for CV fixtures; stdlib zipfile for LinkedIn fixtures. Deterministic KB assertions via the fake extractor.

**Files:**
- Create: `tests/conftest.py`, `tests/e2e/test_voice_note_flow.py`, `tests/e2e/test_duration_limit.py`, `tests/e2e/test_cv_flow.py`, `tests/e2e/test_sources_flow.py`, `tests/e2e/test_prompts_api.py`

- [ ] **Step 1: Shared fixtures** — `tests/conftest.py`:

```python
"""Shared fixtures: synthesized audio files for the whole test suite."""

from __future__ import annotations

import math
import struct
import subprocess
import sys
import wave
from pathlib import Path

import pytest

SPEECH_TEXT = (
    "This week I completed the payment gateway migration project "
    "using Python and Kubernetes with zero downtime."
)


def make_tone_wav(path: Path, seconds: float, freq: float = 440.0, rate: int = 16000) -> Path:
    """Pure-Python WAV generator — used for duration-limit tests."""
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(int(seconds * rate)):
            frames += struct.pack("<h", int(32767 * 0.3 * math.sin(2 * math.pi * freq * i / rate)))
        w.writeframes(bytes(frames))
    return path


def make_speech_wav(path: Path, text: str = SPEECH_TEXT) -> Path:
    """Real synthesized speech via Windows SAPI (System.Speech)."""
    if sys.platform != "win32":
        pytest.skip("speech fixture generation requires Windows SAPI")
    script = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        f"$s.SetOutputToWaveFile('{path}'); "
        f"$s.Speak('{text}'); "
        "$s.Dispose()"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
        check=True, capture_output=True,
    )
    return path


@pytest.fixture(scope="session")
def speech_wav(tmp_path_factory) -> Path:
    return make_speech_wav(tmp_path_factory.mktemp("audio") / "speech.wav")


@pytest.fixture(scope="session")
def overlong_tone_wav(tmp_path_factory) -> Path:
    return make_tone_wav(tmp_path_factory.mktemp("audio") / "long.wav", seconds=130.0)
```

- [ ] **Step 2: Voice-note pipeline E2E** — `tests/e2e/test_voice_note_flow.py`:

```python
"""Full pipeline: real WAV upload → real whisper transcription → extraction → KB on disk."""

import shutil

import pytest
from fastapi.testclient import TestClient

from resume_kb_server.app import create_app
from resume_kb_server.settings import Settings

pytestmark = [pytest.mark.e2e, pytest.mark.transcription]


@pytest.fixture()
def client(tmp_path):
    prompts_dir = tmp_path / "prompts"
    shutil.copytree("prompts", prompts_dir)
    settings = Settings(
        kb_root=tmp_path / "kb",
        prompts_root=prompts_dir,
        extractor_backend="fake",
        whisper_model="tiny",
        whisper_device="cpu",
        whisper_compute_type="int8",
    )
    return TestClient(create_app(settings))


def test_voice_note_creates_kb_entries_and_is_searchable(client, speech_wav, tmp_path):
    with open(speech_wav, "rb") as f:
        response = client.post("/api/notes", files={"audio": ("note.wav", f, "audio/wav")})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["language"] == "en"
    assert len(data["transcript"]) > 10
    assert data["entries"], "expected KB entries to be created"

    # Fake extractor is deterministic → these slugs must exist on disk.
    assert (tmp_path / "kb" / "skill" / "skill-python.md").exists()
    assert (tmp_path / "kb" / "skill" / "skill-kubernetes.md").exists()
    assert (tmp_path / "kb" / "index.md").exists()

    # And they are searchable end-to-end.
    hits = client.get("/api/kb/search", params={"q": "kubernetes"}).json()
    assert any(h["slug"] == "skill-kubernetes" for h in hits)

    # Entry detail endpoint round-trips.
    detail = client.get("/api/kb/entries/skill-python").json()
    assert detail["title"] == "Python"
    assert detail["entry_type"] == "skill"
```

- [ ] **Step 3: Duration-limit E2E** — `tests/e2e/test_duration_limit.py`:

```python
import shutil

import pytest
from fastapi.testclient import TestClient

from resume_kb_server.app import create_app
from resume_kb_server.settings import Settings

pytestmark = pytest.mark.e2e


class _ExplodingTranscriber:
    def transcribe(self, path, max_seconds=120.0):  # pragma: no cover
        raise AssertionError("transcription must not run for over-long audio")


@pytest.fixture()
def client(tmp_path):
    prompts_dir = tmp_path / "prompts"
    shutil.copytree("prompts", prompts_dir)
    settings = Settings(kb_root=tmp_path / "kb", prompts_root=prompts_dir, extractor_backend="fake")
    return TestClient(create_app(settings, transcriber=_ExplodingTranscriber()))


def test_overlong_note_is_rejected_before_transcription(client, overlong_tone_wav):
    with open(overlong_tone_wav, "rb") as f:
        response = client.post("/api/notes", files={"audio": ("long.wav", f, "audio/wav")})
    assert response.status_code == 422
    assert "120" in response.json()["detail"]
```

Wait — the duration check currently happens inside `Transcriber.transcribe`. With `_ExplodingTranscriber` injected, validation must still occur. **Adjust `app.py`** (Task 10) if needed so `create_note` calls `validate_duration(tmp, settings.max_note_seconds)` explicitly BEFORE invoking the transcriber:

```python
from voice_transcribe import DurationLimitExceeded, Transcriber, validate_duration
...
        try:
            validate_duration(tmp, max_seconds=settings.max_note_seconds)
        except DurationLimitExceeded as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        result = get_transcriber().transcribe(tmp, max_seconds=settings.max_note_seconds)
```

(The transcriber still re-validates internally — defense in depth; the endpoint-level check makes the 422 contract independent of the transcriber implementation.)

- [ ] **Step 4: CV flow E2E** — `tests/e2e/test_cv_flow.py`:

```python
import shutil

import docx
import pytest
from fastapi.testclient import TestClient

from resume_kb_server.app import create_app
from resume_kb_server.settings import Settings

pytestmark = pytest.mark.e2e


@pytest.fixture()
def client(tmp_path):
    prompts_dir = tmp_path / "prompts"
    shutil.copytree("prompts", prompts_dir)
    settings = Settings(kb_root=tmp_path / "kb", prompts_root=prompts_dir, extractor_backend="fake")
    return TestClient(create_app(settings))


@pytest.fixture()
def cv_docx(tmp_path):
    doc = docx.Document()
    doc.add_heading("Vivek Subramanian", level=1)
    doc.add_paragraph("Senior Backend Engineer")
    doc.add_paragraph("Skills: Python, Kubernetes, PostgreSQL")
    path = tmp_path / "cv.docx"
    doc.save(str(path))
    return path


def test_cv_upload_creates_profile_entries(client, cv_docx, tmp_path):
    with open(cv_docx, "rb") as f:
        response = client.post("/api/documents", files={"document": ("cv.docx", f)})
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Vivek Subramanian"
    assert (tmp_path / "kb" / "person" / "person-vivek-subramanian.md").exists()
    assert (tmp_path / "kb" / "experience" / "experience-acme-corp-senior-engineer.md").exists()

    hits = client.get("/api/kb/search", params={"q": "payments"}).json()
    assert hits, "CV content should be searchable"


def test_legacy_doc_is_rejected(client, tmp_path):
    legacy = tmp_path / "cv.doc"
    legacy.write_bytes(b"\xd0\xcf\x11\xe0 fake")
    with open(legacy, "rb") as f:
        response = client.post("/api/documents", files={"document": ("cv.doc", f)})
    assert response.status_code == 422
    assert "docx" in response.json()["detail"].lower()
```

- [ ] **Step 5: GitHub + LinkedIn + cross-source merge E2E** — `tests/e2e/test_sources_flow.py`:

```python
import shutil
import zipfile

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from resume_kb_server.app import create_app
from resume_kb_server.settings import Settings

pytestmark = pytest.mark.e2e
GITHUB = "https://api.github.com"


@pytest.fixture()
def client(tmp_path):
    prompts_dir = tmp_path / "prompts"
    shutil.copytree("prompts", prompts_dir)
    settings = Settings(kb_root=tmp_path / "kb", prompts_root=prompts_dir, extractor_backend="fake")
    return TestClient(create_app(settings))


@respx.mock
def test_github_ingest_end_to_end(client, tmp_path):
    respx.get(f"{GITHUB}/users/vivek").mock(
        return_value=Response(200, json={"login": "vivek", "name": "Vivek", "bio": "eng"})
    )
    respx.get(f"{GITHUB}/users/vivek/repos").mock(
        return_value=Response(200, json=[
            {"name": "payments-svc", "description": "Payments", "fork": False,
             "stargazers_count": 3, "topics": []},
        ])
    )
    respx.get(f"{GITHUB}/repos/vivek/payments-svc/languages").mock(
        return_value=Response(200, json={"Python": 100})
    )
    respx.get(f"{GITHUB}/repos/vivek/payments-svc/readme").mock(
        return_value=Response(200, text="# payments-svc")
    )

    response = client.post("/api/sources/github", json={"username": "vivek"})
    assert response.status_code == 200, response.text
    assert response.json()["repos"] == 1
    assert (tmp_path / "kb" / "project" / "project-payments-svc.md").exists()
    assert (tmp_path / "kb" / "skill" / "skill-python.md").exists()


def test_linkedin_ingest_end_to_end(client, tmp_path):
    zip_path = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_path, "w") as z:
        z.writestr("Profile.csv",
                   "First Name,Last Name,Headline,Summary\nVivek,Subramanian,Engineer,Builds things.\n")
        z.writestr("Skills.csv", "Name\nGo\n")

    with open(zip_path, "rb") as f:
        response = client.post("/api/sources/linkedin", files={"export": ("export.zip", f)})
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Vivek Subramanian"
    assert (tmp_path / "kb" / "person" / "person-vivek-subramanian.md").exists()
    assert (tmp_path / "kb" / "skill" / "skill-go.md").exists()


def test_cross_source_merge(client, tmp_path):
    """The same skill arriving from two sources merges into one entry with both sources."""
    zip_path = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_path, "w") as z:
        z.writestr("Profile.csv", "First Name,Last Name,Headline,Summary\nV,S,,\n")
        z.writestr("Skills.csv", "Name\nPython\n")
    with open(zip_path, "rb") as f:
        client.post("/api/sources/linkedin", files={"export": ("export.zip", f)})

    with respx.mock:
        respx.get(f"{GITHUB}/users/v").mock(
            return_value=Response(200, json={"login": "v", "name": "V", "bio": ""})
        )
        respx.get(f"{GITHUB}/users/v/repos").mock(
            return_value=Response(200, json=[
                {"name": "r", "description": "", "fork": False, "stargazers_count": 0, "topics": []},
            ])
        )
        respx.get(f"{GITHUB}/repos/v/r/languages").mock(
            return_value=Response(200, json={"Python": 1})
        )
        respx.get(f"{GITHUB}/repos/v/r/readme").mock(return_value=Response(404))
        client.post("/api/sources/github", json={"username": "v"})

    detail = client.get("/api/kb/entries/skill-python").json()
    assert "linkedin-export" in detail["sources"]
    assert "github:v" in detail["sources"]
```

- [ ] **Step 6: Prompts API E2E** — `tests/e2e/test_prompts_api.py` (proves the user's prompt-control requirement end to end):

```python
import shutil

import pytest
from fastapi.testclient import TestClient

from resume_kb_server.app import create_app
from resume_kb_server.settings import Settings

pytestmark = pytest.mark.e2e


class _RecordingExtractor:
    """Captures the instructions passed in, returns the canned fake result."""

    def __init__(self, inner):
        self.inner = inner
        self.last_instructions = None

    def extract(self, text, schema, instructions):
        self.last_instructions = instructions
        return self.inner.extract(text, schema, instructions)


@pytest.fixture()
def setup(tmp_path):
    from resume_kb_server.fakes import build_fake_extractor

    prompts_dir = tmp_path / "prompts"
    shutil.copytree("prompts", prompts_dir)
    settings = Settings(kb_root=tmp_path / "kb", prompts_root=prompts_dir, extractor_backend="fake")
    extractor = _RecordingExtractor(build_fake_extractor())
    client = TestClient(create_app(settings, extractor=extractor))
    return client, extractor


def test_prompts_are_listable_and_readable(setup):
    client, _ = setup
    names = client.get("/api/prompts").json()["prompts"]
    assert set(names) == {"cv_profile", "professional_update"}
    content = client.get("/api/prompts/professional_update").json()["content"]
    assert "explicitly mentioned" in content


def test_edited_prompt_is_used_on_the_next_request(setup, tmp_path):
    client, extractor = setup

    marker = "ALWAYS TAG ACHIEVEMENTS WITH QUARTER"
    original = client.get("/api/prompts/cv_profile").json()["content"]
    response = client.put(
        "/api/prompts/cv_profile", json={"content": original + "\n" + marker}
    )
    assert response.status_code == 200
    assert marker in response.json()["content"]

    # Trigger an extraction that uses the CV prompt — the edited text must reach the extractor.
    import docx
    doc = docx.Document()
    doc.add_heading("Vivek Subramanian", level=1)
    cv = tmp_path / "cv.docx"
    doc.save(str(cv))
    with open(cv, "rb") as f:
        client.post("/api/documents", files={"document": ("cv.docx", f)})
    assert extractor.last_instructions is not None
    assert marker in extractor.last_instructions


def test_unknown_prompt_is_404(setup):
    client, _ = setup
    assert client.get("/api/prompts/nope").status_code == 404
    assert client.put("/api/prompts/nope", json={"content": "x"}).status_code == 404
```

- [ ] **Step 7: Run the suites**

Run: `uv run pytest tests/e2e -v -m "not browser"`
Expected: all pass (voice-note test downloads whisper-tiny on first run — allow a few minutes). Fix any integration bugs revealed here before committing; that is this suite's job.

- [ ] **Step 8: Commit**

```bash
git add tests apps/server
git commit -m "test(e2e): API pipeline suites — voice, CV, sources, prompts, merge"
```

---

### Task 12: Frontend — design-led UI (frontend-design skill)

**Tech grounding:** **frontend-design skill** for visual direction and implementation quality; vanilla ES-module JavaScript (no build step — served by FastAPI StaticFiles); MediaRecorder API (`audio/webm`, 120 s auto-stop with visible countdown); fetch + FormData uploads; semantic, accessible HTML.

**Files:**
- Replace: `apps/server/src/resume_kb_server/static/index.html`
- Create: `apps/server/src/resume_kb_server/static/app.js`, `apps/server/src/resume_kb_server/static/style.css`

- [ ] **Step 1: Invoke the frontend-design skill** with this brief (paste it verbatim into the skill invocation):

> **Product:** resumeKB — a voice-first personal knowledge base for professional updates.
> **Feel:** confident, editorial, calm; a personal instrument, not a SaaS dashboard. Absolutely avoid generic AI aesthetics (no Inter/Roboto, no purple gradients, no cookie-cutter cards). Distinctive typography and a cohesive palette; micro-interactions on record/save; dark-mode friendly is a plus but optional.
> **Layout (single page, max ~880px column, must work at 375px mobile width):**
> 1. **Recorder hero** — the emotional core. Large record control with clear recording state (pulse/waveform-style feedback), a 0:00→2:00 countdown that visibly warns near the limit, a status line, and the last transcript rendered as a quotation once saved.
> 2. **Sources row** — three compact import affordances: CV file (PDF/DOCX), GitHub username, LinkedIn export ZIP. Each shows per-import progress/success/error states.
> 3. **Knowledge base browser** — search-as-you-type with result snippets, entry list filterable by type chips (note/skill/project/experience/person/organization/source), and an entry detail view rendering the markdown body (wikilinks may render as plain styled tags).
> 4. **Prompt editor (ADMIN-ONLY)** — an "Extraction prompts" panel: a select for the prompt name, a monospace textarea, and a save button with saved/error feedback. **Hidden by default.** The header carries an "Admin" toggle switch (`#admin-toggle`, `aria-pressed` reflecting state); flipping it on reveals the panel, flipping it off hides it. Regular users never see the panel. This is a client-side gate for now (placeholder for future auth) — style the panel so it reads as privileged (e.g. a small "admin only" badge and a lock icon).
> **Hard contract — these element IDs MUST exist with these behaviors (Playwright E2E depends on them):** `#admin-toggle` (button with `aria-pressed`; toggles visibility of the prompt panel), `#record-btn` (toggles recording; label flips between record/stop states), `#timer`, `#status` (aria-live polite; contains the word "Saved" after a successful note), `#transcript`, `#cv-input` + `#cv-upload-btn`, `#github-input` + `#github-btn`, `#linkedin-input` + `#linkedin-btn`, `#search-input`, `#search-results`, `#notes-list` (one `<li>` per KB entry, text includes the entry title), `#entry-detail` with `#entry-title` and `#entry-body`, `#prompt-panel` (the admin-gated container), `#prompt-select`, `#prompt-editor` (textarea), `#prompt-save-btn`.
> **API contract:** `POST /api/notes` (FormData field `audio`, webm) → `{transcript, language, duration_s, entries[]}` or `{detail}` on 4xx; `POST /api/documents` (field `document`); `POST /api/sources/github` (JSON `{username}`) → `{repos, entries[]}`; `POST /api/sources/linkedin` (field `export`); `GET /api/kb/entries[?type=]`; `GET /api/kb/entries/{slug}`; `GET /api/kb/search?q=`; `GET /api/prompts`; `GET/PUT /api/prompts/{name}` (PUT body `{content}`).
> **Recorder logic:** `navigator.mediaDevices.getUserMedia({audio:true})` → `MediaRecorder` with `audio/webm`; auto-stop at exactly 120 s; on stop, upload and show "Transcribing and updating knowledge base…" then "Saved — N knowledge base entries updated." Handle microphone-permission errors and 422 rejections in `#status`.
> **Constraints:** three static files only (`index.html`, `app.js`, `style.css`), no frameworks, no build step, no external JS; web fonts via a `<link>` are allowed; must pass basic a11y (labels, focus states, aria-live status).

- [ ] **Step 2: Implement the three static files** per the skill's design direction, honoring the ID and API contracts above exactly.

- [ ] **Step 3: Manual smoke check**

Run: `uv run uvicorn --factory resume_kb_server.app:create_app --port 8137` with `KB_EXTRACTOR=fake` and `WHISPER_MODEL=tiny` in `.env` (or set for the session).
Open http://127.0.0.1:8137 — record a short note (mic permission), watch it save; import a CV; search; edit a prompt and save. Verify all contract IDs exist: run in the browser console:

```js
["admin-toggle","record-btn","timer","status","transcript","cv-input","cv-upload-btn","github-input","github-btn","linkedin-input","linkedin-btn","search-input","search-results","notes-list","entry-detail","entry-title","entry-body","prompt-panel","prompt-select","prompt-editor","prompt-save-btn"].filter(id => !document.getElementById(id))
```

Expected: `[]` (empty array). Also verify the admin gate: on load the prompt panel is not visible; clicking `#admin-toggle` reveals it; clicking again hides it. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/resume_kb_server/static
git commit -m "feat(frontend): design-led recorder, sources, KB browser, prompt editor"
```

---

### Task 13: Frontend polish — impeccable review pass

**Tech grounding:** **impeccable skill** (UI critique/polish: visual hierarchy, spacing, typography, states, a11y, motion) applied to the Task 12 UI; findings implemented in the same three static files.

- [ ] **Step 1:** Start the server (`KB_EXTRACTOR=fake`), then invoke the **impeccable** skill against the running UI at http://127.0.0.1:8137, scoped to: visual hierarchy, typography, spacing rhythm, empty states (no entries yet), loading/error states, recorder state clarity, mobile (375px) layout, keyboard/focus accessibility.
- [ ] **Step 2:** Apply the review's findings to `index.html` / `app.js` / `style.css`. The element-ID contract from Task 12 must survive unchanged (re-run the console check from Task 12 Step 3).
- [ ] **Step 3:** Re-run the manual smoke flow (record → save → search → prompt edit) to confirm nothing regressed.
- [ ] **Step 4: Commit**

```bash
git add apps/server/src/resume_kb_server/static
git commit -m "style(frontend): apply impeccable review findings"
```

---

### Task 14: Browser E2E — Playwright with fake microphone

**Tech grounding:** Playwright (Chromium) launched with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<speech.wav>`; uvicorn in a background thread; real whisper-tiny transcribing what the browser's MediaRecorder actually captured; also drives the prompt editor UI.

**Files:**
- Create: `tests/e2e/test_browser.py`

- [ ] **Step 1:** Run `uv run playwright install chromium` (once).

- [ ] **Step 2:** Write `tests/e2e/test_browser.py`:

```python
"""Browser E2E: fake microphone feeds real speech WAV → recorder → server → KB list updates."""

import shutil
import threading
import time

import pytest
import uvicorn
from playwright.sync_api import sync_playwright

from resume_kb_server.app import create_app
from resume_kb_server.settings import Settings

pytestmark = [pytest.mark.e2e, pytest.mark.browser, pytest.mark.transcription]

PORT = 8765


@pytest.fixture()
def live_server(tmp_path):
    prompts_dir = tmp_path / "prompts"
    shutil.copytree("prompts", prompts_dir)
    settings = Settings(
        kb_root=tmp_path / "kb",
        prompts_root=prompts_dir,
        extractor_backend="fake",
        whisper_model="tiny",
        whisper_device="cpu",
        whisper_compute_type="int8",
    )
    config = uvicorn.Config(create_app(settings), host="127.0.0.1", port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 15
    while not server.started:
        if time.time() > deadline:
            raise RuntimeError("uvicorn did not start")
        time.sleep(0.1)
    yield f"http://127.0.0.1:{PORT}"
    server.should_exit = True
    thread.join(timeout=10)


@pytest.fixture()
def page(live_server, speech_wav):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            f"--use-file-for-fake-audio-capture={speech_wav}",
        ])
        context = browser.new_context(permissions=["microphone"])
        page = context.new_page()
        page.goto(live_server)
        yield page
        browser.close()


def test_record_and_save_note_in_browser(page):
    page.click("#record-btn")           # start
    page.wait_for_timeout(4000)         # capture ~4s of the fake mic (our speech wav)
    page.click("#record-btn")           # stop → upload

    page.wait_for_selector("#status:has-text('Saved')", timeout=120_000)
    assert page.locator("#transcript").inner_text().strip() != ""
    # Fake extractor is deterministic → these entries must appear in the list.
    page.wait_for_selector("#notes-list li:has-text('Python')")
    page.wait_for_selector("#notes-list li:has-text('Payment Gateway Migration')")


def test_prompt_editor_is_admin_gated_and_roundtrips(page):
    # Hidden for regular users by default.
    assert not page.locator("#prompt-panel").is_visible()

    # Admin toggle reveals it.
    page.click("#admin-toggle")
    page.wait_for_selector("#prompt-panel", state="visible")

    page.select_option("#prompt-select", "professional_update")
    editor = page.locator("#prompt-editor")
    original = editor.input_value()
    assert "explicitly mentioned" in original

    editor.fill(original + "\nBROWSER EDIT MARKER")
    page.click("#prompt-save-btn")
    page.reload()
    assert not page.locator("#prompt-panel").is_visible()  # gate resets on reload
    page.click("#admin-toggle")
    page.select_option("#prompt-select", "professional_update")
    assert "BROWSER EDIT MARKER" in page.locator("#prompt-editor").input_value()
```

- [ ] **Step 3:** Run: `uv run pytest tests/e2e/test_browser.py -v -m browser`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/test_browser.py
git commit -m "test(e2e): Playwright browser flows — fake-mic recording and prompt editing"
```

---

### Task 15: README, full suite, final review

**Tech grounding:** documentation of every technology choice for developer handoff; ruff lint gate; full pytest run.

- [ ] **Step 1:** Replace `README.md`:

```markdown
# resumeKB — voice-first professional knowledge base (v2)

Record short voice notes (max 2 minutes) about your professional work; resumeKB
transcribes them locally with **faster-whisper**, extracts structured facts with
the **OpenAI API** using **prompts you own and can edit** (`prompts/*.md`), and
maintains an **OKF-style markdown knowledge base** (skills, projects, experiences,
notes — cross-linked with `[[wikilinks]]`, searchable via SQLite FTS5,
git-versionable). Enrich it with your **CV (PDF/DOCX)**, **GitHub profile**, and
**LinkedIn data export**.

## Architecture

Reusable packages (each usable independently in other projects):

| Package | Purpose | Key tech |
|---|---|---|
| `kb-core` | OKF markdown entries, store, FTS5 search, index page | PyYAML, SQLite FTS5 |
| `voice-transcribe` | Duration limits + local transcription | PyAV, faster-whisper |
| `knowledge-extract` | Structured extraction behind a protocol + editable prompt library | OpenAI `responses.parse`, Pydantic |
| `doc-ingest` | PDF/DOCX → markdown + CV profile mapping | markitdown |
| `profile-ingest` | GitHub REST + LinkedIn data-export ZIP | httpx, stdlib zip/csv |

`apps/server` (FastAPI) composes them and serves the static frontend.

## Prompts — you control the extraction

The instructions sent to OpenAI live in `prompts/professional_update.md` and
`prompts/cv_profile.md`. Edit them in any editor (or the in-app "Extraction
prompts" panel) — changes apply on the next request, no restart.

## Run

```powershell
uv sync
# .env already carries OPENAI_API_KEY, KB_EXTRACTOR, WHISPER_MODEL, PORT (8137), etc.
uv run uvicorn --factory resume_kb_server.app:create_app --port 8137
```

Open http://127.0.0.1:8137. Set `KB_EXTRACTOR=fake` in `.env` to run fully
offline with canned extraction (no API key needed).

## Test (E2E-only by design)

```powershell
uv run pytest -m "not browser"        # API-level pipeline E2E (real speech + real whisper tiny)
uv run playwright install chromium    # once
uv run pytest -m browser              # browser E2E (fake microphone)
uv run pytest -m "not transcription"  # skip whisper-model tests (fastest)
```

The suite uses real synthesized speech (Windows SAPI) through real transcription
into the real store; OpenAI is replaced by a deterministic fake; GitHub is mocked
with respx. LinkedIn ingestion parses the official data-export ZIP (no scraping).
```

- [ ] **Step 2:** Run everything:

Run: `uv run pytest -v` → all pass (include browser tests if chromium installed, else `-m "not browser"`).
Run: `uv run ruff check .` → clean (fix anything it reports).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: v2 README with architecture, prompts control, and E2E test guide"
```

- [ ] **Step 4:** Final whole-implementation code review (controller dispatches a reviewer across the full branch diff), then finish the branch (merge/PR decision).

---

## Self-Review Notes

- **Spec coverage:** faster-whisper ✅ (Task 6, real transcription in Tasks 11/14); OKF format ✅ (Tasks 2–3, hardened parser); OpenKB architecture (ingest → linked entity pages → vectorless search) ✅ (Tasks 3, 5, 7–9); **OpenAI API for text processing** ✅ (Task 4 — `responses.parse` structured outputs, `OPENAI_MODEL`/`OPENAI_API_KEY` from `.env`); **prompt control via prompt .md files** ✅ (Tasks 1, 4, 10 — files + hot reload + API; proven E2E in Task 11 Step 6 and in the browser in Task 14); **attractive UI via frontend-design + impeccable** ✅ (Tasks 12–13 with written brief + ID contract); **best technical implementation** ✅ (protocol-based DI, defense-in-depth duration checks, provenance-merging store, deterministic offline mode); **E2E-testing-only** ✅ (no unit test files; module smoke checks + two E2E layers in Tasks 11 and 14); 2-minute cap ✅ (client + server, Tasks 6/10/12); CV PDF/DOCX ✅ / `.doc` rejected ✅ (Task 7); GitHub ✅ (Task 8); LinkedIn export ✅ (Task 9); reusable modules ✅ (five packages with own pyprojects).
- **Type consistency:** `KBEntry(slug, title, entry_type, body, tags, sources, created_at, updated_at)` identical across Tasks 2/3/5/7/8/9. `StructuredExtractor.extract(text, schema, instructions)` across Tasks 4/10/11. `PromptLibrary.names()/get()/set()` across Tasks 4/10. `Settings` fields consistent across Tasks 10/11/14 (incl. `prompts_root`). Element-ID contract identical in Tasks 12 and 14.
- **Known caveats:** SAPI speech fixture is Windows-only (non-Windows skips those tests); whisper-tiny downloads once; `openai>=1.66` required for `responses.parse`; structured outputs need gpt-4o-class models; port 8137 (8000 occupied on the dev machine); tests copy `prompts/` into tmp dirs so prompt-editing tests never mutate the repo's prompt files.
