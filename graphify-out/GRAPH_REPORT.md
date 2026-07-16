# Graph Report - .  (2026-07-16)

## Corpus Check
- 122 files · ~51,744 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 429 nodes · 629 edges · 44 communities (25 shown, 19 thin omitted)
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 126 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Probe Generator Core|Probe Generator Core]]
- [[_COMMUNITY_Product & SDD Docs|Product & SDD Docs]]
- [[_COMMUNITY_React App Shell|React App Shell]]
- [[_COMMUNITY_Server + E2E Tests|Server + E2E Tests]]
- [[_COMMUNITY_Web Package Config|Web Package Config]]
- [[_COMMUNITY_SDD Frontend Refs|SDD Frontend Refs]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Package Architecture|Package Architecture]]
- [[_COMMUNITY_Capture UI Components|Capture UI Components]]
- [[_COMMUNITY_shadcn Component Config|shadcn Component Config]]
- [[_COMMUNITY_Probe API Endpoints|Probe API Endpoints]]
- [[_COMMUNITY_FastAPI Server Routes|FastAPI Server Routes]]
- [[_COMMUNITY_SDD UI Task Reports|SDD UI Task Reports]]
- [[_COMMUNITY_UI Card + Utils|UI Card + Utils]]
- [[_COMMUNITY_UI Popover|UI Popover]]
- [[_COMMUNITY_UI Toggle Group|UI Toggle Group]]
- [[_COMMUNITY_UI Tabs|UI Tabs]]
- [[_COMMUNITY_API Client Library|API Client Library]]
- [[_COMMUNITY_UI Tooltip|UI Tooltip]]
- [[_COMMUNITY_UI Button|UI Button]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 30 edges
2. `ProbeStore` - 20 edges
3. `compilerOptions` - 19 edges
4. `ProbeQuestion` - 17 edges
5. `GapAnalysisProbeGenerator` - 16 edges
6. `Settings` - 14 edges
7. `resumeKB System` - 14 edges
8. `CaptureView` - 14 edges
9. `Plan: Frontend React Migration` - 13 edges
10. `Spec: Probe Feature Design` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Second Brain That Probes` --semantically_similar_to--> `ProbeCard.tsx Component`  [INFERRED] [semantically similar]
  PRODUCT.md → .superpowers/sdd/task-7-brief.md
- `Unified Capture Card Pattern` --rationale_for--> `UnifiedCaptureCard Component`  [INFERRED]
  docs/superpowers/plans/2026-07-14-unified-capture-card.md → apps/web/src/components/UnifiedCaptureCard.tsx
- `ProbeGenerator as Protocol` --rationale_for--> `probe.py (ProbeGenerator, ProbeQuestion, GapAnalysisProbeGenerator)`  [INFERRED]
  docs/superpowers/specs/2026-07-15-probe-feature-design.md → packages/knowledge-extract/src/knowledge_extract/probe.py
- `Eager Probe Generation Strategy` --rationale_for--> `POST /api/probe/answer Endpoint`  [INFERRED]
  docs/superpowers/specs/2026-07-15-probe-feature-design.md → apps/server/src/resume_kb_server/app.py
- `OKF Entry Format Design` --rationale_for--> `kb-core Package`  [EXTRACTED]
  docs/superpowers/plans/2026-07-05-voice-first-kb-v2.md → packages/kb-core/src/kb_core/__init__.py

## Hyperedges (group relationships)
- **Full-Stack Probe Feature** — task1_gap_analysis_probe_generator, task2_probe_store, task3_get_probe_endpoint, task4_app_tsx, task7_probe_card_tsx [EXTRACTED 0.95]
- **KB Ingest Pipeline** — readme_voice_transcribe, readme_knowledge_extract, readme_kb_core, readme_server [EXTRACTED 0.95]
- **React Frontend Shell** — task6_header_tsx, task6_bottom_nav_tsx, task4_app_tsx, task10_auth_card_tsx [INFERRED 0.85]
- **Voice Note Ingestion Pipeline** — pkg_voice_transcribe, pkg_knowledge_extract, pkg_kb_core, prompt_professional_update, app_server [EXTRACTED 1.00]
- **Multi-Source KB Enrichment** — pkg_doc_ingest, pkg_profile_ingest, pkg_kb_core, app_server [EXTRACTED 1.00]
- **User-Owned Prompt Control System** — prompt_professional_update, prompt_cv_profile, pkg_knowledge_extract, index_html_frontend, app_server [EXTRACTED 1.00]
- **Probe Generation Pipeline** — probe_probe_py, probe_probe_store, api_endpoint_probe_get, api_endpoint_probe_answer, prompt_probe_generation [EXTRACTED 1.00]
- **Capture View UI Composition** — view_captureview, component_unifiedcapturecard, component_inlinerecordbutton, component_sourcepopover, hook_userecorder [EXTRACTED 1.00]
- **Frontend Build and Deployment Pipeline** — script_build_web, dockerfile, server_app [INFERRED 0.85]

## Communities (44 total, 19 thin omitted)

### Community 0 - "Probe Generator Core"
Cohesion: 0.07
Nodes (27): GapAnalysisProbeGenerator, ProbeQuestion, Pluggable probe question generation from KB entries., Analyzes KB gaps using an LLM and generates a reflective question., ProbeStore, File-based storage for pending probe questions., Manages a single pending probe per user as a JSON file., create_app() (+19 more)

### Community 1 - "Product & SDD Docs"
Cohesion: 0.09
Nodes (42): Design Principles, resumeKB Product, Second Brain That Probes, SDD Progress — Probe Feature, doc-ingest Package, faster-whisper Transcription, kb-core Package, knowledge-extract Package (+34 more)

### Community 2 - "React App Shell"
Cohesion: 0.07
Nodes (25): AuthCard(), AuthCardProps, BottomNav(), BottomNavProps, Tab, Header(), HeaderProps, Tab (+17 more)

### Community 3 - "Server + E2E Tests"
Cohesion: 0.07
Nodes (20): convert_to_markdown(), Document → markdown conversion via markitdown (PDF and DOCX)., UnsupportedDocumentType, Captures the instructions passed in, returns the canned fake result., _RecordingExtractor, setup(), Exception, ExtractionError (+12 more)

### Community 4 - "Web Package Config"
Cohesion: 0.07
Nodes (29): dependencies, class-variance-authority, clsx, @icon-park/react, lucide-react, next-themes, radix-ui, react (+21 more)

### Community 5 - "SDD Frontend Refs"
Cohesion: 0.18
Nodes (26): App.tsx Shell, AuthCard Component, BottomNav Component, Header Component, Icon Component, InlineRecordButton Component, ProbeCard Component, RecordButton Component (+18 more)

### Community 6 - "TypeScript Config"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleDetection (+13 more)

### Community 7 - "Package Architecture"
Cohesion: 0.16
Nodes (19): FastAPI Server App, resumeKB Frontend SPA, doc-ingest Package, kb-core Package, knowledge-extract Package, profile-ingest Package, voice-transcribe Package, Voice-First KB v2 Implementation Plan (+11 more)

### Community 8 - "Capture UI Components"
Cohesion: 0.14
Nodes (12): InlineRecordButton(), InlineRecordButtonProps, SourcePopover(), SourcePopoverProps, formatTime(), UnifiedCaptureCard(), UnifiedCaptureCardProps, Waveform() (+4 more)

### Community 9 - "shadcn Component Config"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+8 more)

### Community 10 - "Probe API Endpoints"
Cohesion: 0.33
Nodes (16): POST /api/probe/answer Endpoint, GET /api/probe Endpoint, POST /api/probe/skip Endpoint, Dockerfile (Multi-stage Build), Plan: Probe Feature, Plan: Frontend Wiring Migration, probe.py (ProbeGenerator, ProbeQuestion, GapAnalysisProbeGenerator), ProbeStore (+8 more)

### Community 11 - "FastAPI Server Routes"
Cohesion: 0.19
Nodes (10): BaseModel, _change_message(), GitHubIngestRequest, _ingest_response(), _kb_updated(), _maybe_generate_probe(), ProbeAnswerRequest, PromptUpdateRequest (+2 more)

### Community 12 - "SDD UI Task Reports"
Cohesion: 0.18
Nodes (13): Polish — Light/Dark Ambient Orbs + Final Styling, KnowledgeView.tsx (hover glow), orb-primary / orb-secondary CSS Classes, Icon.tsx Component, Task 4 Report: IconPark hover wrapper, Ambient Orbs Background, BottomNav.tsx Component, App Shell Header + BottomNav + Ambient (+5 more)

### Community 13 - "UI Card + Utils"
Cohesion: 0.33
Nodes (8): cn(), Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader(), CardTitle()

### Community 14 - "UI Popover"
Cohesion: 0.25
Nodes (4): PopoverContent(), PopoverDescription(), PopoverHeader(), PopoverTitle()

### Community 15 - "UI Toggle Group"
Cohesion: 0.33
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 16 - "UI Tabs"
Cohesion: 0.40
Nodes (5): Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 17 - "API Client Library"
Cohesion: 0.53
Nodes (4): get(), headers(), post(), upload()

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (3): FakeStructuredExtractor, Task 1 Fix Report: FakeStructuredExtractor, Task 1 Report: ProbeGenerator Protocol

## Knowledge Gaps
- **97 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+92 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `KBEntry` connect `Probe Generator Core` to `React App Shell`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `cn()` connect `UI Card + Utils` to `Web Package Config`, `UI Popover`, `UI Toggle Group`, `UI Tabs`, `UI Tooltip`, `UI Button`, `Community 20`, `Community 21`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 29`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `create_app()` connect `Probe Generator Core` to `Server + E2E Tests`, `FastAPI Server Routes`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `cn()` (e.g. with `Badge()` and `Button()`) actually correct?**
  _`cn()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `ProbeStore` (e.g. with `ProbeQuestion` and `FakePromptLibrary`) actually correct?**
  _`ProbeStore` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `ProbeQuestion` (e.g. with `StructuredExtractor` and `ProbeStore`) actually correct?**
  _`ProbeQuestion` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `GapAnalysisProbeGenerator` (e.g. with `StructuredExtractor` and `FakePromptLibrary`) actually correct?**
  _`GapAnalysisProbeGenerator` has 11 INFERRED edges - model-reasoned connections that need verification._