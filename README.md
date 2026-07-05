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
