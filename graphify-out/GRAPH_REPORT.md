# Graph Report - .  (2026-07-13)

## Corpus Check
- Corpus is ~20,180 words - fits in a single context window. You may not need a graph.

## Summary
- 294 nodes · 473 edges · 22 communities (12 shown, 10 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 66 edges (avg confidence: 0.75)
- Token cost: 63,461 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend SPA|Frontend SPA]]
- [[_COMMUNITY_E2E Test Suite|E2E Test Suite]]
- [[_COMMUNITY_Data Models & Mapping|Data Models & Mapping]]
- [[_COMMUNITY_KB Core Storage|KB Core Storage]]
- [[_COMMUNITY_Server & Auth|Server & Auth]]
- [[_COMMUNITY_Extraction Pipeline|Extraction Pipeline]]
- [[_COMMUNITY_Architecture Overview|Architecture Overview]]
- [[_COMMUNITY_Doc Convert & Prompts|Doc Convert & Prompts]]
- [[_COMMUNITY_Voice Transcription|Voice Transcription]]
- [[_COMMUNITY_GitHub Profile Ingest|GitHub Profile Ingest]]
- [[_COMMUNITY_Auth Guard Tests|Auth Guard Tests]]
- [[_COMMUNITY_Test Fixtures|Test Fixtures]]
- [[_COMMUNITY_Whisper Cache Script|Whisper Cache Script]]
- [[_COMMUNITY_E2E Conftest|E2E Conftest]]
- [[_COMMUNITY_Doc Ingest Init|Doc Ingest Init]]
- [[_COMMUNITY_KB Core Init|KB Core Init]]
- [[_COMMUNITY_Knowledge Extract Init|Knowledge Extract Init]]
- [[_COMMUNITY_Profile Ingest Init|Profile Ingest Init]]
- [[_COMMUNITY_Server Init|Server Init]]
- [[_COMMUNITY_Voice Transcribe Init|Voice Transcribe Init]]
- [[_COMMUNITY_Supabase Auth Tech|Supabase Auth Tech]]

## God Nodes (most connected - your core abstractions)
1. `$()` - 21 edges
2. `create_app()` - 14 edges
3. `apiFetch()` - 14 edges
4. `KBStore` - 13 edges
5. `init()` - 12 edges
6. `KBEntry` - 11 edges
7. `Settings` - 9 edges
8. `loadEntries()` - 9 edges
9. `enterAuthenticatedApp()` - 8 edges
10. `e2e_settings()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `OKF Entry Format Design` --rationale_for--> `kb-core Package`  [EXTRACTED]
  docs/superpowers/plans/2026-07-05-voice-first-kb-v2.md → packages/kb-core/src/kb_core/__init__.py
- `OpenAI Structured Outputs Extraction` --rationale_for--> `knowledge-extract Package`  [EXTRACTED]
  docs/superpowers/plans/2026-07-05-voice-first-kb-v2.md → packages/knowledge-extract/src/knowledge_extract/__init__.py
- `kb-core Package` --implements--> `SQLite FTS5 Search`  [EXTRACTED]
  packages/kb-core/src/kb_core/__init__.py → README.md
- `knowledge-extract Package` --implements--> `OpenAI API (Structured Outputs)`  [EXTRACTED]
  packages/knowledge-extract/src/knowledge_extract/__init__.py → README.md
- `create_app()` --calls--> `PromptLibrary`  [INFERRED]
  apps/server/src/resume_kb_server/app.py → packages/knowledge-extract/src/knowledge_extract/prompts.py

## Hyperedges (group relationships)
- **Voice Note Ingestion Pipeline** — pkg_voice_transcribe, pkg_knowledge_extract, pkg_kb_core, prompt_professional_update, app_server [EXTRACTED 1.00]
- **Multi-Source KB Enrichment** — pkg_doc_ingest, pkg_profile_ingest, pkg_kb_core, app_server [EXTRACTED 1.00]
- **User-Owned Prompt Control System** — prompt_professional_update, prompt_cv_profile, pkg_knowledge_extract, index_html_frontend, app_server [EXTRACTED 1.00]

## Communities (22 total, 10 thin omitted)

### Community 0 - "Frontend SPA"
Cohesion: 0.12
Nodes (50): $(), apiFetch(), applySourceResult(), bindEvents(), enterAuthenticatedApp(), escapeHtml(), handleSignIn(), handleSignOut() (+42 more)

### Community 1 - "E2E Test Suite"
Cohesion: 0.08
Nodes (17): e2e_settings(), Shared helpers for E2E tests., user_kb_root(), live_server(), Browser E2E: fake microphone feeds real speech WAV → recorder → server → KB list, client(), test_cv_upload_creates_profile_entries(), client() (+9 more)

### Community 2 - "Data Models & Mapping"
Cohesion: 0.10
Nodes (23): BaseModel, cv_to_entries(), CVProfile, EducationItem, ExperienceItem, CV profile schema and mapping to KB entries., Lowercase ASCII slug; non-alphanumerics collapse to single hyphens., slugify() (+15 more)

### Community 3 - "KB Core Storage"
Cohesion: 0.11
Nodes (11): KBIndex, SQLite FTS5 full-text index over KB entries (vectorless retrieval)., SearchHit, from_markdown(), KBEntry, KB entry model: OKF-style markdown files with YAML frontmatter and wikilinks., KBStore, Filesystem store: one markdown file per entry, grouped by type, plus index.md. (+3 more)

### Community 4 - "Server & Auth"
Cohesion: 0.10
Nodes (17): authed_client(), auth_required_server(), Browser E2E: login gate hides record, KB, and import UI until authenticated., _change_message(), create_app(), GitHubIngestRequest, _ingest_response(), _kb_updated() (+9 more)

### Community 5 - "Extraction Pipeline"
Cohesion: 0.09
Nodes (14): Captures the instructions passed in, returns the canned fake result., _RecordingExtractor, setup(), ExtractionError, FakeStructuredExtractor, OpenAIStructuredExtractor, StructuredExtractor protocol with OpenAI and deterministic fake implementations., Extracts any Pydantic schema from text using OpenAI structured outputs.      R (+6 more)

### Community 6 - "Architecture Overview"
Cohesion: 0.14
Nodes (21): FastAPI Server App, resumeKB Frontend SPA, doc-ingest Package, kb-core Package, knowledge-extract Package, profile-ingest Package, voice-transcribe Package, Voice-First KB v2 Implementation Plan (+13 more)

### Community 7 - "Doc Convert & Prompts"
Cohesion: 0.13
Nodes (11): convert_to_markdown(), Document → markdown conversion via markitdown (PDF and DOCX)., UnsupportedDocumentType, test_prompts_are_listable_and_readable(), Exception, PromptLibrary, PromptNotFound, File-based prompt library: prompts are markdown files the user owns and edits. (+3 more)

### Community 8 - "Voice Transcription"
Cohesion: 0.17
Nodes (11): main(), Smoke test for voice-transcribe duration enforcement., AudioInfo, DurationLimitExceeded, probe(), Container probing and duration enforcement via PyAV (no external ffmpeg needed)., validate_duration(), faster-whisper wrapper: validates duration first, then transcribes. (+3 more)

### Community 9 - "GitHub Profile Ingest"
Cohesion: 0.33
Nodes (4): GitHubClient, GitHubProfile, GitHub REST ingestion: profile + top repos + languages + README excerpts., RepoInfo

### Community 11 - "Test Fixtures"
Cohesion: 0.32
Nodes (7): make_speech_wav(), make_tone_wav(), overlong_tone_wav(), Shared fixtures: synthesized audio files for the whole test suite., Pure-Python WAV generator — used for duration-limit tests., Real synthesized speech via Windows SAPI (System.Speech)., speech_wav()

## Knowledge Gaps
- **3 isolated node(s):** `state`, `promptCache`, `Serena Project Configuration`
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `create_app()` connect `Server & Auth` to `E2E Test Suite`, `Extraction Pipeline`, `Doc Convert & Prompts`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Why does `PromptLibrary` connect `Doc Convert & Prompts` to `Server & Auth`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `create_app()` (e.g. with `Settings` and `PromptLibrary`) actually correct?**
  _`create_app()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `KBStore` (e.g. with `KBIndex` and `SearchHit`) actually correct?**
  _`KBStore` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `FastAPI app factory composing all resumeKB packages.`, `Supabase JWT validation for per-user KB scoping.`, `Canned extractor responses — used by tests and by KB_EXTRACTOR=fake demo mode.` to the rest of the system?**
  _51 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend SPA` be split into smaller, more focused modules?**
  _Cohesion score 0.11538461538461539 - nodes in this community are weakly interconnected._
- **Should `E2E Test Suite` be split into smaller, more focused modules?**
  _Cohesion score 0.07816091954022988 - nodes in this community are weakly interconnected._