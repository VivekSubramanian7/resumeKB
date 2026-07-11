"""Shared E2E fixtures with auth disabled for offline testing."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest


@pytest.fixture()
def prompts_dir(tmp_path):
    path = tmp_path / "prompts"
    shutil.copytree("prompts", path)
    return path
