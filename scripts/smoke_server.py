"""Smoke test for server app factory."""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from resume_kb_server.app import create_app
from resume_kb_server.settings import Settings


def main() -> None:
    s = Settings(kb_root=Path(tempfile.mkdtemp()) / "kb", extractor_backend="fake")
    c = TestClient(create_app(s))
    r = c.get("/api/prompts")
    assert r.status_code == 200 and "professional_update" in r.json()["prompts"]
    r2 = c.get("/api/kb/entries")
    assert r2.status_code == 200 and r2.json() == []
    print("server-ok")


if __name__ == "__main__":
    main()
