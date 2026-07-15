# Probe Feature Design

## Goal

Add an AI-powered "probe" system that asks users thoughtful, reflective questions derived from their existing knowledge base. Questions target gaps in the user's professional profile to help surface tacit knowledge, motivations, and stories behind their skills and projects.

## Architecture

### Components

1. **Probe Generator** — pluggable algorithm interface in `packages/knowledge-extract/`. First implementation: gap-analysis strategy that compares KB content against a completeness template and asks the LLM to generate a question targeting the biggest gap.

2. **Probe API** — two new endpoints on the FastAPI server:
   - `GET /api/probe` — returns the next pre-computed probe question, or 204 No Content if none pending
   - `POST /api/probe/answer` — accepts the user's answer, runs it through the existing extraction pipeline, persists results to KB

3. **Probe Storage** — one cached probe per user as `<kb-data>/<user-id>/.kb/pending_probe.json`. No new database.

4. **Probe Prompt** — `prompts/probe_generation.md`, user-editable, hot-reloadable (same pattern as existing prompts).

5. **Frontend wiring** — replace mocked probe data with real API calls.

### Data Flow

```
KB change (any ingest endpoint) 
  → trigger probe generation (eager, in same request)
  → LLM receives KB entries + probe_generation prompt
  → writes pending_probe.json

Frontend load 
  → GET /api/probe 
  → returns { question, context, related_entries } or 204

User answers 
  → POST /api/probe/answer { text }
  → extraction pipeline (same as voice notes)
  → new KB entries persisted
  → triggers next probe generation
```

## Pluggable Algorithm Interface

```python
from typing import Protocol
from pydantic import BaseModel
from kb_core import KBEntry


class ProbeQuestion(BaseModel):
    question: str
    context: str
    related_entries: list[str]


class ProbeGenerator(Protocol):
    def generate(self, entries: list[KBEntry]) -> ProbeQuestion | None:
        """Generate the next probe question given current KB state. Returns None if KB is empty or no gaps found."""
        ...
```

### First Implementation: GapAnalysisProbeGenerator

- Reads all KB entries for the user
- Sends entry titles, types, tags, and body snippets to the LLM with the `probe_generation` prompt
- The prompt defines "profile dimensions" (motivations, origin stories, challenges overcome, trade-off reasoning, collaboration style, etc.) and instructs the LLM to identify the biggest gap and generate a single reflective question about it
- Returns a `ProbeQuestion` with the question, a context string explaining why it's being asked, and slugs of related entries

### Swapping Algorithms Later

The `ProbeGenerator` protocol allows future strategies (connection-based, random-walk, user-goal-driven) to be plugged in without changing the API or storage layer. The server instantiates whichever generator is configured.

## API Specification

### GET /api/probe

Returns the current pending probe for the authenticated user.

**Query params:**
- `force` (optional, boolean) — if true, regenerate a fresh probe even if one is already pending (used by Brain button)

**Response 200:**
```json
{
  "question": "What made you choose FastAPI over Django for resumeKB?",
  "context": "Your KB mentions FastAPI and Python but doesn't capture the reasoning behind this architectural choice.",
  "related_entries": ["fastapi", "python", "resumekb"]
}
```

**Response 204:** No pending probe (KB is empty or probe was already answered this session).

### POST /api/probe/answer

Submits the user's answer to the current probe. The answer is processed through the same extraction pipeline as voice notes (`ProfessionalUpdate` schema + `professional_update` prompt).

**Request body:**
```json
{
  "text": "I chose FastAPI because..."
}
```

**Response 200:**
```json
{
  "entries": ["fastapi", "api-design"],
  "changes": [{"slug": "fastapi", "title": "FastAPI", "entry_type": "skill", "action": "updated"}],
  "kb_updated": true,
  "message": "Saved — updated 1: FastAPI (skill)."
}
```

Same response shape as other ingest endpoints for frontend consistency.

### POST /api/probe/skip

Marks the current probe as skipped without answering. Clears the pending probe so a new one generates on next KB change.

**Response 200:**
```json
{ "ok": true }
```

## Probe Storage Format

File: `<kb-data>/<user-id>/.kb/pending_probe.json`

```json
{
  "question": "...",
  "context": "...",
  "related_entries": ["slug-1", "slug-2"],
  "generated_at": "2026-07-15T10:30:00Z",
  "served": false
}
```

- `served: true` after GET /api/probe returns it (prevents re-serving on refresh within cooldown)
- File is deleted after answer or skip
- File is overwritten when a new probe is generated (after ingest or force-refresh)

## Cooldown Logic

- **Backend:** After a probe is served (`served: true`), don't auto-generate a new one until either: (a) user answers/skips, or (b) new KB content is ingested.
- **Frontend:** On app load, call `GET /api/probe`. If 204, probe stays hidden. If question returned and not already shown this browser session (tracked in `sessionStorage`), auto-show it. At most once per session.
- **Brain button:** Always calls `GET /api/probe?force=true`, bypassing cooldown. Shows whatever comes back.

## Eager Generation Trigger

After every successful ingest that actually changes the KB (`kb_updated: true`), call the probe generator and write the result to `pending_probe.json`. This happens synchronously at the end of the ingest request (adds ~1-2s to ingest latency, acceptable since ingests are already LLM-bound).

Ingest endpoints that trigger probe generation:
- `POST /api/notes` (voice)
- `POST /api/notes/text`
- `POST /api/documents` (CV)
- `POST /api/sources/github`
- `POST /api/sources/linkedin`
- `POST /api/probe/answer` (answering a probe can itself yield new knowledge)

## Prompt: prompts/probe_generation.md

```markdown
You are a reflective interviewer helping someone build their professional knowledge base.

Given the current state of their knowledge base (entries listed below), identify the biggest gap in their professional narrative and generate ONE thoughtful question to help them fill it.

Profile dimensions to consider:
- Origin stories: why they chose their field, pivotal moments
- Motivations: what drives them, what problems excite them
- Trade-off reasoning: why they chose tool X over Y, architectural decisions
- Challenges overcome: difficult problems, failures turned into lessons
- Collaboration style: how they work with others, leadership moments
- Impact stories: concrete outcomes, metrics, before/after
- Values: what they optimize for, what they refuse to compromise on

Rules:
- Ask exactly ONE question
- The question should be reflective and personal — something that makes them think, not just recall facts
- Target the dimension with the least coverage in their current KB
- The question should connect to entries they already have (reference specifics)
- Keep the question conversational and warm, not clinical
- Provide a brief "context" sentence explaining why this question matters for their profile
- List the slugs of KB entries that informed this question

Output JSON with fields: question, context, related_entries
```

## Frontend Changes

### App.tsx

- On mount (after auth resolves), call `GET /api/probe`
- If response is 200 and `sessionStorage.getItem("probe-shown") !== "true"`:
  - Set `probeVisible: true` and store the question/context in state
  - Set `sessionStorage.setItem("probe-shown", "true")`
- If 204: leave probe hidden (`probeVisible: false`)
- Brain button: call `GET /api/probe?force=true`, show whatever returns

### CaptureView.tsx

- Remove hardcoded `probeQuestion` and `probeContext` strings
- Pass the fetched question/context from App state down as props (same interface, just dynamic data)
- `handleSaveProbe`: POST to `/api/probe/answer` with the text, show success/error toast from response
- Skip button: POST to `/api/probe/skip`, dismiss probe UI

### UnifiedCaptureCard.tsx

- No changes needed. Props interface stays the same: `probeQuestion`, `probeContext`, `probeVisible`, `onProbeSave`, `onProbeSkip`.

## Error Handling

- If probe generation fails (LLM error), log and leave no pending probe. User gets 204.
- If `GET /api/probe` is called with empty KB, return 204 (nothing to ask about).
- If `/api/probe/answer` extraction fails, return the same 502 as other extraction errors.
- If the probe prompt file is missing, probe generation silently skips (feature degrades gracefully).

## Testing Strategy

- Unit test `GapAnalysisProbeGenerator` with `FakeStructuredExtractor` — verify it produces a `ProbeQuestion` from sample entries
- Unit test probe API endpoints (GET returns cached probe, POST processes answer, skip clears)
- Unit test cooldown logic (served flag, regeneration triggers)
- Integration test: ingest a note → verify pending_probe.json is written → GET /api/probe returns it → POST answer → verify new entries + new probe generated

## Files to Create/Modify

**Create:**
- `packages/knowledge-extract/src/knowledge_extract/probe.py` — `ProbeGenerator` protocol, `ProbeQuestion` model, `GapAnalysisProbeGenerator` class
- `prompts/probe_generation.md` — the generation prompt
- `tests/test_probe.py` — unit + integration tests

**Modify:**
- `packages/knowledge-extract/src/knowledge_extract/__init__.py` — export probe types
- `apps/server/src/resume_kb_server/app.py` — add probe endpoints, add generation trigger to ingest endpoints
- `apps/web/src/App.tsx` — fetch probe on load, manage state
- `apps/web/src/views/CaptureView.tsx` — remove mocks, wire to API
- `apps/web/src/lib/api.ts` — add probe API helpers (if needed beyond existing `post`/`get`)
