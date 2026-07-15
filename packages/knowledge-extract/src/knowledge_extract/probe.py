"""Pluggable probe question generation from KB entries."""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel

from kb_core import KBEntry
from knowledge_extract.extractors import StructuredExtractor
from knowledge_extract.prompts import PromptLibrary

PROBE_PROMPT_NAME = "probe_generation"


class ProbeQuestion(BaseModel):
    question: str
    context: str
    related_entries: list[str]


class ProbeGenerator(Protocol):
    def generate(self, entries: list[KBEntry]) -> ProbeQuestion | None: ...


class GapAnalysisProbeGenerator:
    """Analyzes KB gaps using an LLM and generates a reflective question."""

    def __init__(self, extractor: StructuredExtractor, prompts: PromptLibrary) -> None:
        self._extractor = extractor
        self._prompts = prompts

    def generate(self, entries: list[KBEntry]) -> ProbeQuestion | None:
        if not entries:
            return None
        kb_summary = self._build_kb_summary(entries)
        prompt = self._prompts.get(PROBE_PROMPT_NAME)
        return self._extractor.extract(kb_summary, ProbeQuestion, prompt)

    def _build_kb_summary(self, entries: list[KBEntry]) -> str:
        lines: list[str] = []
        for entry in entries:
            snippet = entry.body[:200].replace("\n", " ")
            lines.append(f"- [{entry.entry_type}] {entry.title} (tags: {', '.join(entry.tags)}): {snippet}")
        return "\n".join(lines)
