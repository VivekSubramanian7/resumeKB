"""StructuredExtractor protocol with OpenAI and deterministic fake implementations."""

from __future__ import annotations

from typing import Protocol, TypeVar

from openai import OpenAI
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class ExtractionError(Exception):
    pass


class StructuredExtractor(Protocol):
    def extract(self, text: str, schema: type[T], instructions: str) -> T: ...


class OpenAIStructuredExtractor:
    """Extracts any Pydantic schema from text using OpenAI structured outputs.

    Requires a structured-outputs-capable model (gpt-4o and newer).
    """

    def __init__(self, model: str = "gpt-4o", client: OpenAI | None = None) -> None:
        self._client = client or OpenAI()
        self._model = model

    def extract(self, text: str, schema: type[T], instructions: str) -> T:
        response = self._client.responses.parse(
            model=self._model,
            instructions=instructions,
            input=text,
            text_format=schema,
        )
        parsed = response.output_parsed
        if parsed is None:
            raise ExtractionError(
                f"model {self._model} returned no parsed {schema.__name__} "
                f"(refusal or incomplete output)"
            )
        return parsed


class FakeStructuredExtractor:
    """Deterministic extractor for tests and keyless demo mode."""

    def __init__(self, responses: dict[type[BaseModel], BaseModel]) -> None:
        self._responses = responses

    def extract(self, text: str, schema: type[T], instructions: str) -> T:
        try:
            return self._responses[schema]  # type: ignore[return-value]
        except KeyError as exc:
            raise KeyError(f"FakeStructuredExtractor has no canned response for {schema}") from exc
