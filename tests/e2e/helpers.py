"""Shared helpers for E2E tests."""

from __future__ import annotations

from pathlib import Path

from resume_kb_server.auth import TEST_USER_ID
from resume_kb_server.settings import Settings


def e2e_settings(tmp_path: Path, **overrides) -> Settings:
    kb_data_dir = overrides.pop("kb_data_dir", tmp_path / "kb-data")
    return Settings(
        kb_data_dir=kb_data_dir,
        prompts_root=overrides.pop("prompts_root", tmp_path / "prompts"),
        extractor_backend=overrides.pop("extractor_backend", "fake"),
        auth_disabled=overrides.pop("auth_disabled", True),
        **overrides,
    )


def user_kb_root(tmp_path: Path) -> Path:
    return tmp_path / "kb-data" / TEST_USER_ID
