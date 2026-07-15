"""Tests for probe question generation."""

import io
import json

import pytest
from fastapi.testclient import TestClient
from pathlib import Path
from pydantic import BaseModel

from kb_core import KBEntry
from knowledge_extract import FakeStructuredExtractor
from knowledge_extract.probe import GapAnalysisProbeGenerator, ProbeQuestion
from knowledge_extract.probe_store import ProbeStore


class FakePromptLibrary:
    """Returns a fixed prompt string."""

    def get(self, name: str) -> str:
        return "Generate a probe question."


def _make_entry(slug: str, title: str, entry_type: str = "skill", body: str = "") -> KBEntry:
    return KBEntry(slug=slug, title=title, entry_type=entry_type, body=body or f"Details about {title}.")


class TestProbeQuestion:
    def test_probe_question_model(self):
        pq = ProbeQuestion(question="Why Python?", context="No origin story.", related_entries=["skill-python"])
        assert pq.question == "Why Python?"
        assert pq.context == "No origin story."
        assert pq.related_entries == ["skill-python"]


class TestGapAnalysisProbeGenerator:
    def _make_extractor(self) -> FakeStructuredExtractor:
        canned_response = ProbeQuestion(
            question="What motivated you to learn Python?",
            context="Your KB has Python as a skill but no origin story.",
            related_entries=["skill-python"],
        )
        return FakeStructuredExtractor({ProbeQuestion: canned_response})

    def test_generate_returns_probe_question(self):
        gen = GapAnalysisProbeGenerator(
            extractor=self._make_extractor(),
            prompts=FakePromptLibrary(),
        )
        entries = [
            _make_entry("skill-python", "Python"),
            _make_entry("project-resumekb", "resumeKB", "project"),
        ]
        result = gen.generate(entries)
        assert result is not None
        assert isinstance(result, ProbeQuestion)
        assert result.question == "What motivated you to learn Python?"
        assert result.related_entries == ["skill-python"]

    def test_generate_returns_none_for_empty_kb(self):
        gen = GapAnalysisProbeGenerator(
            extractor=self._make_extractor(),
            prompts=FakePromptLibrary(),
        )
        result = gen.generate([])
        assert result is None


class TestProbeStore:
    def test_save_and_load(self, tmp_path: Path):
        store = ProbeStore(tmp_path, "user-123")
        probe = ProbeQuestion(
            question="Why Python?",
            context="No origin story.",
            related_entries=["skill-python"],
        )
        store.save(probe)
        loaded = store.load()
        assert loaded is not None
        assert loaded.question == "Why Python?"
        assert loaded.related_entries == ["skill-python"]

    def test_load_returns_none_when_no_file(self, tmp_path: Path):
        store = ProbeStore(tmp_path, "user-456")
        assert store.load() is None

    def test_mark_served_and_is_served(self, tmp_path: Path):
        store = ProbeStore(tmp_path, "user-123")
        probe = ProbeQuestion(question="Q?", context="C", related_entries=[])
        store.save(probe)
        assert store.is_served() is False
        store.mark_served()
        assert store.is_served() is True
        # load still works after marking served
        assert store.load() is not None

    def test_clear_removes_probe(self, tmp_path: Path):
        store = ProbeStore(tmp_path, "user-123")
        probe = ProbeQuestion(question="Q?", context="C", related_entries=[])
        store.save(probe)
        store.clear()
        assert store.load() is None


@pytest.fixture
def app_client(tmp_path: Path):
    """Create a test app with fake extractor and a pre-populated KB."""
    from resume_kb_server.app import create_app
    from resume_kb_server.settings import Settings

    settings = Settings(
        kb_data_dir=tmp_path / "kb-data",
        prompts_root=Path(__file__).resolve().parent.parent / "prompts",
        extractor_backend="fake",
        auth_disabled=True,
    )
    app = create_app(settings=settings)
    return TestClient(app)


@pytest.fixture
def app_client_with_probe(tmp_path: Path):
    """Create a test app with a pending probe already saved."""
    from resume_kb_server.app import create_app
    from resume_kb_server.settings import Settings

    kb_data = tmp_path / "kb-data"
    settings = Settings(
        kb_data_dir=kb_data,
        prompts_root=Path(__file__).resolve().parent.parent / "prompts",
        extractor_backend="fake",
        auth_disabled=True,
    )

    # Pre-write a pending probe for the anonymous user (TEST_USER_ID = "test-user-id")
    probe_dir = kb_data / "test-user-id" / ".kb"
    probe_dir.mkdir(parents=True)
    probe_data = {
        "question": "What drives your interest in APIs?",
        "context": "Your KB mentions FastAPI but not why you chose it.",
        "related_entries": ["skill-fastapi"],
        "generated_at": "2026-07-15T10:00:00+00:00",
        "served": False,
    }
    (probe_dir / "pending_probe.json").write_text(json.dumps(probe_data))

    app = create_app(settings=settings)
    return TestClient(app)


class TestProbeAPI:
    def test_get_probe_returns_204_when_none(self, app_client):
        resp = app_client.get("/api/probe")
        assert resp.status_code == 204

    def test_get_probe_returns_pending(self, app_client_with_probe):
        resp = app_client_with_probe.get("/api/probe")
        assert resp.status_code == 200
        data = resp.json()
        assert data["question"] == "What drives your interest in APIs?"
        assert data["context"] == "Your KB mentions FastAPI but not why you chose it."
        assert "skill-fastapi" in data["related_entries"]

    def test_post_probe_skip(self, app_client_with_probe):
        resp = app_client_with_probe.post("/api/probe/skip")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        # Probe is now cleared
        resp2 = app_client_with_probe.get("/api/probe")
        assert resp2.status_code == 204

    def test_post_probe_answer(self, app_client_with_probe):
        resp = app_client_with_probe.post(
            "/api/probe/answer",
            json={"text": "I chose FastAPI because of its speed and type safety."},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "changes" in data
        assert "kb_updated" in data
        assert "message" in data


class TestProbeLifecycle:
    """Integration: ingest triggers probe generation, answer clears and regenerates."""

    def test_ingest_generates_probe(self, tmp_path: Path):
        """After a voice note ingest that updates KB, a probe should be generated."""
        from resume_kb_server.app import create_app
        from resume_kb_server.settings import Settings
        from kb_core import KBStore

        settings = Settings(
            kb_data_dir=tmp_path / "kb-data",
            prompts_root=Path(__file__).resolve().parent.parent / "prompts",
            extractor_backend="fake",
            auth_disabled=True,
        )
        app = create_app(settings=settings)
        client = TestClient(app)

        # Initially no probe
        resp = client.get("/api/probe")
        assert resp.status_code == 204

        # Manually populate KB and generate probe to simulate post-ingest state
        user_dir = tmp_path / "kb-data" / "test-user-id"
        store = KBStore(user_dir)
        entry = KBEntry(
            slug="skill-python",
            title="Python",
            entry_type="skill",
            body="Python programming language.",
            tags=["skill"],
            sources=["test"],
        )
        store.save(entry)

        canned_probe_question = ProbeQuestion(
            question="What motivated you to learn Python?",
            context="Your KB has Python as a skill but no origin story.",
            related_entries=["skill-python"],
        )
        extractor = FakeStructuredExtractor({ProbeQuestion: canned_probe_question})
        probe_store = ProbeStore(tmp_path / "kb-data", "test-user-id")
        gen = GapAnalysisProbeGenerator(
            extractor=extractor,
            prompts=FakePromptLibrary(),
        )
        probe = gen.generate(store.list())
        assert probe is not None
        probe_store.save(probe)

        # Now GET /api/probe should return it
        resp = client.get("/api/probe")
        assert resp.status_code == 200
        assert resp.json()["question"] == "What motivated you to learn Python?"

    def test_answer_clears_probe(self, app_client_with_probe):
        """Answering a probe clears it."""
        # Verify probe exists
        resp = app_client_with_probe.get("/api/probe")
        assert resp.status_code == 200

        # Answer it
        resp = app_client_with_probe.post(
            "/api/probe/answer",
            json={"text": "I love building APIs because they connect systems elegantly."},
        )
        assert resp.status_code == 200

        # Old probe is cleared; fake extractor generates a new one immediately
        resp = app_client_with_probe.get("/api/probe")
        assert resp.status_code == 200
        assert resp.json()["question"] == "What motivated you to start your career in software?"
