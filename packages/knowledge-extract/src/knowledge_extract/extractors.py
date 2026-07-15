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
    """Extracts any Pydantic schema from text via chat completions + JSON schema.

    Works with OpenAI and any compatible local server (LM Studio, Ollama, etc.).
    Pass base_url to point at a local server, e.g. http://192.168.1.x:1234/v1.
    """

    def __init__(
        self,
        model: str = "gpt-4o",
        client: OpenAI | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
    ) -> None:
        if client:
            self._client = client
        else:
            kwargs: dict = {}
            if base_url:
                kwargs["base_url"] = base_url
            if api_key:
                kwargs["api_key"] = api_key
            self._client = OpenAI(**kwargs)
        self._model = model

    def extract(self, text: str, schema: type[T], instructions: str) -> T:
        import json

        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": instructions},
                {"role": "user", "content": text},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": schema.__name__,
                    "schema": schema.model_json_schema(),
                    "strict": True,
                },
            },
        )
        content = response.choices[0].message.content
        if not content:
            raise ExtractionError(
                f"model {self._model} returned no content for {schema.__name__}"
            )
        return schema.model_validate(json.loads(content))


class FakeStructuredExtractor:
    """Deterministic extractor for tests and keyless demo mode."""

    def __init__(self, responses: dict[type[BaseModel], BaseModel]) -> None:
        self._responses = responses

    def extract(self, text: str, schema: type[T], instructions: str) -> T:
        try:
            return self._responses[schema]  # type: ignore[return-value]
        except KeyError as exc:
            raise KeyError(f"FakeStructuredExtractor has no canned response for {schema}") from exc
