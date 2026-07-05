"""Smoke tests for kb-core (run via: uv run python scripts/smoke_kb_core.py)."""

from __future__ import annotations

import tempfile
from datetime import datetime, timezone
from pathlib import Path

from kb_core import KBEntry, KBStore


def test_roundtrip() -> None:
    now = datetime(2026, 7, 5, tzinfo=timezone.utc)
    e = KBEntry(
        slug="n",
        title="Q1 --- Draft",
        entry_type="note",
        body="Intro.\n\n---\n\nAfter rule --- dashes.",
        sources=["t"],
        created_at=now,
        updated_at=now,
    )
    assert KBEntry.from_markdown(e.to_markdown(), slug="n") == e
    print("roundtrip-ok")


def test_store() -> None:
    root = Path(tempfile.mkdtemp()) / "kb"
    s = KBStore(root)
    now = datetime.now(timezone.utc)
    s.save(
        KBEntry(
            slug="note-1",
            title="Kubernetes migration",
            entry_type="note",
            body="Migrated to Kubernetes.",
            sources=["t"],
            created_at=now,
            updated_at=now,
        )
    )
    hits = s.search("kubernetes")
    assert hits and hits[0].slug == "note-1"
    m = s.upsert_merge(
        KBEntry(
            slug="note-1",
            title="Kubernetes migration",
            entry_type="note",
            body="Second pass.",
            tags=["x"],
            sources=["u"],
            created_at=now,
            updated_at=now,
        )
    )
    assert sorted(m.sources) == ["t", "u"] and "Second pass." in m.body
    s.rebuild_index_page()
    assert "[[note-1]]" in (root / "index.md").read_text(encoding="utf-8")
    print("store-ok")


if __name__ == "__main__":
    test_roundtrip()
    test_store()
