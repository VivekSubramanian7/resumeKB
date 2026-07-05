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
from voice_transcribe import DurationLimitExceeded, Transcriber, validate_duration

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
                validate_duration(tmp, max_seconds=settings.max_note_seconds)
            except DurationLimitExceeded as exc:
                raise HTTPException(status_code=422, detail=str(exc))
            result = get_transcriber().transcribe(tmp, max_seconds=settings.max_note_seconds)
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
            "slug": entry.slug,
            "title": entry.title,
            "entry_type": entry.entry_type,
            "body": entry.body,
            "tags": entry.tags,
            "sources": entry.sources,
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
