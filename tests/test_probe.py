"""Tests for probe question generation."""

import pytest
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
