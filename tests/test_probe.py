"""Tests for probe question generation."""

import pytest
from pydantic import BaseModel

from kb_core import KBEntry
from knowledge_extract import FakeStructuredExtractor
from knowledge_extract.probe import GapAnalysisProbeGenerator, ProbeQuestion


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
