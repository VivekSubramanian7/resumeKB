"""FastAPI app factory composing all resumeKB packages."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from doc_ingest import CVProfile, UnsupportedDocumentType, convert_to_markdown, cv_to_entries
from kb_core import KBEntry, KBStore
from knowledge_extract import (
    ExtractionError,
    GapAnalysisProbeGenerator,
    OpenAIStructuredExtractor,
    ProfessionalUpdate,
    PromptLibrary,
    PromptNotFound,
    ProbeStore,
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

from resume_kb_server.auth import AuthUser, make_get_current_user
from resume_kb_server.fakes import build_fake_extractor
from resume_kb_server.settings import Settings

STATIC_DIR = Path(__file__).parent / "static"

UPDATE_PROMPT = "professional_update"
CV_PROMPT = "cv_profile"
PROBE_PROMPT = "probe_generation"


class GitHubIngestRequest(BaseModel):
    username: str


class PromptUpdateRequest(BaseModel):
    content: str


class ProbeAnswerRequest(BaseModel):
    text: str


def _professional_update_has_content(update: ProfessionalUpdate) -> bool:
    return bool(
        update.summary.strip()
        or update.skills
        or update.projects
        or update.achievements
        or update.organizations
    )


def _cv_profile_has_content(profile: CVProfile) -> bool:
    return bool(
        profile.name.strip()
        or profile.headline.strip()
        or profile.summary.strip()
        or profile.skills
        or profile.experiences
        or profile.education
    )


def _persist_store(store: KBStore, entries: list[KBEntry]) -> tuple[list[str], list[dict]]:
    changes: list[dict] = []
    slugs: list[str] = []
    for entry in entries:
        existing = store.get(entry.slug)
        merged = store.upsert_merge(entry)
        if existing is None:
            action = "created"
        elif (
            merged.body != existing.body
            or set(merged.tags) != set(existing.tags)
            or set(merged.sources) != set(existing.sources)
        ):
            action = "updated"
        else:
            action = "unchanged"
        changes.append(
            {
                "slug": merged.slug,
                "title": merged.title,
                "entry_type": merged.entry_type,
                "action": action,
            }
        )
        slugs.append(merged.slug)
    store.rebuild_index_page()
    return slugs, changes


def _kb_updated(changes: list[dict]) -> bool:
    return any(c["action"] in ("created", "updated") for c in changes)


def _change_message(changes: list[dict], *, empty_hint: str) -> str:
    created = [c for c in changes if c["action"] == "created"]
    updated = [c for c in changes if c["action"] == "updated"]
    if not created and not updated:
        return empty_hint
    parts: list[str] = []
    if created:
        names = ", ".join(f"{c['title']} ({c['entry_type']})" for c in created)
        parts.append(f"created {len(created)}: {names}")
    if updated:
        names = ", ".join(f"{c['title']} ({c['entry_type']})" for c in updated)
        parts.append(f"updated {len(updated)}: {names}")
    return "Saved — " + "; ".join(parts) + "."


def _ingest_response(**fields) -> dict:
    changes = fields.pop("changes", [])
    kb_updated = fields.pop("kb_updated", _kb_updated(changes))
    extraction_mode = fields.pop("extraction_mode", "openai")
    if "message" not in fields:
        fields["message"] = _change_message(
            changes,
            empty_hint="Nothing new was added to the knowledge base.",
        )
    message = fields.pop("message")
    if extraction_mode == "fake":
        message = (
            "Demo mode — canned sample extraction was used (your transcript was not analyzed). "
            + message
        )
    return {
        **fields,
        "changes": changes,
        "kb_updated": kb_updated,
        "message": message,
        "extraction_mode": extraction_mode,
    }


def _maybe_generate_probe(
    store: KBStore,
    probe_store: ProbeStore,
    extractor: StructuredExtractor,
    prompts: PromptLibrary,
) -> None:
    """Generate a new probe if the probe prompt exists. Fails silently."""
    try:
        prompts.get(PROBE_PROMPT)
    except PromptNotFound:
        return
    try:
        gen = GapAnalysisProbeGenerator(extractor=extractor, prompts=prompts)
        entries = store.list()
        probe = gen.generate(entries)
        if probe:
            probe_store.save(probe)
    except Exception:
        pass  # probe generation is best-effort


def _build_extractor(settings: Settings) -> StructuredExtractor:
    if settings.extractor_backend == "fake":
        return build_fake_extractor()
    return OpenAIStructuredExtractor(
        model=settings.openai_model,
        base_url=settings.openai_base_url,
        api_key=settings.openai_api_key,
    )


def create_app(
    settings: Settings | None = None,
    extractor: StructuredExtractor | None = None,
    transcriber=None,
) -> FastAPI:
    settings = settings or Settings()
    extractor = extractor or _build_extractor(settings)
    prompts = PromptLibrary(settings.prompts_root)
    app = FastAPI(title="resumeKB")

    get_current_user = make_get_current_user(settings)

    def get_user_store(user: AuthUser = Depends(get_current_user)) -> KBStore:
        return KBStore(settings.kb_data_dir / user.id)

    def get_probe_store(user: AuthUser = Depends(get_current_user)) -> ProbeStore:
        return ProbeStore(settings.kb_data_dir, user.id)

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

    @app.post("/api/notes")
    def create_note(
        audio: UploadFile = File(...),
        store: KBStore = Depends(get_user_store),
        probe_store: ProbeStore = Depends(get_probe_store),
    ):
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
            if not _professional_update_has_content(update):
                return _ingest_response(
                    transcript=result.text,
                    language=result.language,
                    duration_s=result.duration_s,
                    entries=[],
                    changes=[],
                    kb_updated=False,
                    extraction_mode=settings.extractor_backend,
                    message=(
                        "Transcribed your recording, but no skills, projects, or achievements "
                        "were extracted. Try mentioning specific professional details."
                    ),
                )
            entries = update_to_entries(
                update, source=f"voice-note:{audio.filename}", transcript=result.text
            )
            slugs, changes = _persist_store(store, entries)
            if _kb_updated(changes):
                _maybe_generate_probe(store, probe_store, extractor, prompts)
            return _ingest_response(
                transcript=result.text,
                language=result.language,
                duration_s=result.duration_s,
                entries=slugs,
                changes=changes,
                extraction_mode=settings.extractor_backend,
                message=_change_message(
                    changes,
                    empty_hint=(
                        "Transcribed successfully, but the knowledge base already contained "
                        "this information — nothing new was added."
                    ),
                ),
            )
        finally:
            tmp.unlink(missing_ok=True)

    @app.post("/api/documents")
    def upload_cv(
        document: UploadFile = File(...),
        store: KBStore = Depends(get_user_store),
        probe_store: ProbeStore = Depends(get_probe_store),
    ):
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
            if not _cv_profile_has_content(profile):
                return _ingest_response(
                    name=profile.name or document.filename,
                    entries=[],
                    changes=[],
                    kb_updated=False,
                    extraction_mode=settings.extractor_backend,
                    message="CV processed, but no profile information could be extracted.",
                )
            kb_entries = cv_to_entries(profile, source=f"cv:{document.filename}")
            slugs, changes = _persist_store(store, kb_entries)
            if _kb_updated(changes):
                _maybe_generate_probe(store, probe_store, extractor, prompts)
            return _ingest_response(
                name=profile.name,
                entries=slugs,
                changes=changes,
                extraction_mode=settings.extractor_backend,
                message=_change_message(
                    changes,
                    empty_hint=(
                        "CV processed, but the knowledge base already contained this profile — "
                        "nothing new was added."
                    ),
                ),
            )
        finally:
            tmp.unlink(missing_ok=True)

    @app.post("/api/notes/text")
    def upload_text_note(
        document: UploadFile = File(...),
        store: KBStore = Depends(get_user_store),
        probe_store: ProbeStore = Depends(get_probe_store),
    ):
        if not (document.filename or "").lower().endswith(".txt"):
            raise HTTPException(status_code=422, detail="Only .txt files are supported here")
        tmp = _save_upload(document)
        try:
            text = tmp.read_text(encoding="utf-8").strip()
            if not text:
                raise HTTPException(status_code=422, detail="Text file is empty")
            try:
                update = extractor.extract(text, ProfessionalUpdate, prompts.get(UPDATE_PROMPT))
            except ExtractionError as exc:
                raise HTTPException(status_code=502, detail=str(exc))
            if not _professional_update_has_content(update):
                return _ingest_response(
                    entries=[],
                    changes=[],
                    kb_updated=False,
                    extraction_mode=settings.extractor_backend,
                    message=(
                        "File processed, but no skills, projects, or achievements were extracted. "
                        "Try a file with specific professional details."
                    ),
                )
            entries = update_to_entries(update, source=f"text-note:{document.filename}")
            slugs, changes = _persist_store(store, entries)
            if _kb_updated(changes):
                _maybe_generate_probe(store, probe_store, extractor, prompts)
            return _ingest_response(
                entries=slugs,
                changes=changes,
                extraction_mode=settings.extractor_backend,
                message=_change_message(
                    changes,
                    empty_hint="File processed, but the knowledge base already contained this information.",
                ),
            )
        finally:
            tmp.unlink(missing_ok=True)

    @app.post("/api/sources/github")
    def ingest_github(
        request: GitHubIngestRequest,
        store: KBStore = Depends(get_user_store),
        probe_store: ProbeStore = Depends(get_probe_store),
    ):
        profile = GitHubClient(token=settings.github_token).fetch_profile(request.username)
        kb_entries = github_to_entries(profile)
        slugs, changes = _persist_store(store, kb_entries)
        if _kb_updated(changes):
            _maybe_generate_probe(store, probe_store, extractor, prompts)
        return _ingest_response(
            username=profile.username,
            repos=len(profile.repos),
            entries=slugs,
            changes=changes,
            extraction_mode=settings.extractor_backend,
            message=_change_message(
                changes,
                empty_hint=(
                    f"GitHub profile @{profile.username} fetched, but nothing new was added "
                    "to the knowledge base."
                ),
            ),
        )

    @app.post("/api/sources/linkedin")
    def ingest_linkedin(
        export: UploadFile = File(...),
        store: KBStore = Depends(get_user_store),
        probe_store: ProbeStore = Depends(get_probe_store),
    ):
        tmp = _save_upload(export)
        try:
            profile = parse_linkedin_export(tmp)
            kb_entries = linkedin_to_entries(profile)
            slugs, changes = _persist_store(store, kb_entries)
            if _kb_updated(changes):
                _maybe_generate_probe(store, probe_store, extractor, prompts)
            return _ingest_response(
                name=profile.name,
                entries=slugs,
                changes=changes,
                extraction_mode=settings.extractor_backend,
                message=_change_message(
                    changes,
                    empty_hint=(
                        "LinkedIn export parsed, but nothing new was added to the knowledge base."
                    ),
                ),
            )
        finally:
            tmp.unlink(missing_ok=True)

    @app.get("/api/config")
    def get_config():
        return {
            "extractor_backend": settings.extractor_backend,
            "whisper_model": settings.whisper_model,
            "auth_required": not settings.auth_disabled,
            "supabase_url": settings.supabase_url,
            "supabase_anon_key": settings.supabase_anon_key,
            "max_note_seconds": settings.max_note_seconds,
        }

    @app.get("/api/me")
    def get_me(user: AuthUser = Depends(get_current_user)):
        return {"id": user.id, "email": user.email}

    @app.get("/api/kb/search")
    def search(q: str, store: KBStore = Depends(get_user_store)):
        return [
            {"slug": h.slug, "title": h.title, "snippet": h.snippet}
            for h in store.search(q)
        ]

    @app.get("/api/kb/entries")
    def list_entries(type: str | None = None, store: KBStore = Depends(get_user_store)):
        return [
            {"slug": e.slug, "title": e.title, "entry_type": e.entry_type, "tags": e.tags}
            for e in store.list(entry_type=type)
        ]

    @app.get("/api/kb/entries/{slug}")
    def get_entry(slug: str, store: KBStore = Depends(get_user_store)):
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
    def list_prompts(user: AuthUser = Depends(get_current_user)):
        return {"prompts": prompts.names()}

    @app.get("/api/prompts/{name}")
    def get_prompt(name: str, user: AuthUser = Depends(get_current_user)):
        try:
            return {"name": name, "content": prompts.get(name)}
        except PromptNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc))

    @app.put("/api/prompts/{name}")
    def put_prompt(
        name: str,
        request: PromptUpdateRequest,
        user: AuthUser = Depends(get_current_user),
    ):
        try:
            prompts._path(name)  # validates the name
        except PromptNotFound as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if name not in prompts.names():
            raise HTTPException(status_code=404, detail=f"no prompt named {name!r}")
        prompts.set(name, request.content)
        return {"name": name, "content": prompts.get(name)}

    @app.get("/api/probe")
    def get_probe(
        force: bool = False,
        store: KBStore = Depends(get_user_store),
        probe_store: ProbeStore = Depends(get_probe_store),
    ):
        if force:
            _maybe_generate_probe(store, probe_store, extractor, prompts)
        probe = probe_store.load()
        if probe is None:
            return Response(status_code=204)
        probe_store.mark_served()
        return {"question": probe.question, "context": probe.context, "related_entries": probe.related_entries}

    @app.post("/api/probe/answer")
    def answer_probe(
        request: ProbeAnswerRequest,
        store: KBStore = Depends(get_user_store),
        probe_store: ProbeStore = Depends(get_probe_store),
    ):
        if not request.text.strip():
            raise HTTPException(status_code=422, detail="Answer text is empty")
        try:
            update = extractor.extract(
                request.text, ProfessionalUpdate, prompts.get(UPDATE_PROMPT)
            )
        except ExtractionError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
        entries = update_to_entries(update, source="probe-answer")
        slugs, changes = _persist_store(store, entries)
        probe_store.clear()
        if _kb_updated(changes):
            _maybe_generate_probe(store, probe_store, extractor, prompts)
        return _ingest_response(
            entries=slugs,
            changes=changes,
            extraction_mode=settings.extractor_backend,
        )

    @app.post("/api/probe/skip")
    def skip_probe(
        probe_store: ProbeStore = Depends(get_probe_store),
    ):
        probe_store.clear()
        return {"ok": True}

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
    return app
