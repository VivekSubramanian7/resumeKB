"""SQLite FTS5 full-text index over KB entries (vectorless retrieval)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from kb_core.models import KBEntry


@dataclass
class SearchHit:
    slug: str
    title: str
    snippet: str


class KBIndex:
    def __init__(self, db_path: Path) -> None:
        db_path = Path(db_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS entries "
            "USING fts5(slug UNINDEXED, title, body, tags)"
        )
        self._conn.commit()

    def upsert(self, entry: KBEntry) -> None:
        self._conn.execute("DELETE FROM entries WHERE slug = ?", (entry.slug,))
        self._conn.execute(
            "INSERT INTO entries (slug, title, body, tags) VALUES (?, ?, ?, ?)",
            (entry.slug, entry.title, entry.body, " ".join(entry.tags)),
        )
        self._conn.commit()

    def search(self, query: str, limit: int = 20) -> list[SearchHit]:
        # Quote to disable FTS query operators in user input.
        safe = '"' + query.replace('"', " ") + '"'
        rows = self._conn.execute(
            "SELECT slug, title, snippet(entries, 2, '[', ']', '…', 12) "
            "FROM entries WHERE entries MATCH ? ORDER BY rank LIMIT ?",
            (safe, limit),
        ).fetchall()
        return [SearchHit(slug=r[0], title=r[1], snippet=r[2]) for r in rows]
