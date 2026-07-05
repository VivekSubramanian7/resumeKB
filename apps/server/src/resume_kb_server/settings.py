"""Environment-driven settings (reads the repo .env via python-dotenv)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # no-op if .env is absent; existing env vars win


@dataclass
class Settings:
    kb_root: Path = field(default_factory=lambda: Path(os.environ.get("KB_ROOT", "./kb")))
    prompts_root: Path = field(
        default_factory=lambda: Path(os.environ.get("PROMPTS_ROOT", "./prompts"))
    )
    extractor_backend: str = field(
        default_factory=lambda: os.environ.get("KB_EXTRACTOR", "openai")  # "openai" | "fake"
    )
    openai_model: str = field(default_factory=lambda: os.environ.get("OPENAI_MODEL", "gpt-4o"))
    whisper_model: str = field(default_factory=lambda: os.environ.get("WHISPER_MODEL", "large-v3"))
    whisper_device: str = field(default_factory=lambda: os.environ.get("WHISPER_DEVICE", "auto"))
    whisper_compute_type: str = field(
        default_factory=lambda: os.environ.get("WHISPER_COMPUTE", "default")
    )
    max_note_seconds: float = 120.0
    github_token: str | None = field(default_factory=lambda: os.environ.get("GITHUB_TOKEN"))
