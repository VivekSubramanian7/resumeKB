"""Environment-driven settings (reads the repo .env via python-dotenv)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[4]
load_dotenv(_REPO_ROOT / ".env")  # repo-root .env; existing process env wins


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _normalize_supabase_url(url: str) -> str:
    """Accept project URL only — strip accidental REST API suffixes."""
    cleaned = url.strip().rstrip("/")
    for suffix in ("/rest/v1", "/auth/v1"):
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)].rstrip("/")
    return cleaned


def _env(name: str, *fallbacks: str, default: str = "") -> str:
    for key in (name, *fallbacks):
        value = os.environ.get(key)
        if value is not None and value.strip():
            return value.strip()
    return default


@dataclass
class Settings:
    kb_root: Path = field(default_factory=lambda: Path(os.environ.get("KB_ROOT", "./kb")))
    kb_data_dir: Path = field(
        default_factory=lambda: Path(os.environ.get("KB_DATA_DIR", "./kb-data"))
    )
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
    supabase_url: str = field(default_factory=lambda: _env("SUPABASE_URL"))
    supabase_anon_key: str = field(
        default_factory=lambda: _env("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY")
    )
    auth_disabled: bool = field(default_factory=lambda: _env_bool("AUTH_DISABLED", False))

    def __post_init__(self) -> None:
        self.supabase_url = _normalize_supabase_url(self.supabase_url)
