"""Filesystem store: one markdown file per entry, grouped by type, plus index.md."""

from __future__ import annotations

from pathlib import Path

from kb_core.index import KBIndex, SearchHit
from kb_core.models import KBEntry


class KBStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._index = KBIndex(self.root / ".kb" / "index.db")

    def _path(self, entry_type: str, slug: str) -> Path:
        return self.root / entry_type / f"{slug}.md"

    def save(self, entry: KBEntry) -> Path:
        path = self._path(entry.entry_type, entry.slug)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(entry.to_markdown(), encoding="utf-8")
        self._index.upsert(entry)
        return path

    def get(self, slug: str) -> KBEntry | None:
        matches = list(self.root.glob(f"*/{slug}.md"))
        if not matches:
            return None
        return KBEntry.from_markdown(matches[0].read_text(encoding="utf-8"), slug=slug)

    def list(self, entry_type: str | None = None) -> list[KBEntry]:
        pattern = f"{entry_type}/*.md" if entry_type else "*/*.md"
        return [
            KBEntry.from_markdown(p.read_text(encoding="utf-8"), slug=p.stem)
            for p in sorted(self.root.glob(pattern))
            if p.parent.name != ".kb"
        ]

    def upsert_merge(self, entry: KBEntry) -> KBEntry:
        existing = self.get(entry.slug)
        if existing is None:
            self.save(entry)
            return entry
        existing.tags = sorted(set(existing.tags) | set(entry.tags))
        existing.sources = sorted(set(existing.sources) | set(entry.sources))
        if entry.body.strip() and entry.body.strip() not in existing.body:
            existing.body = existing.body.rstrip() + "\n\n" + entry.body.strip()
        existing.updated_at = entry.updated_at or existing.updated_at
        self.save(existing)
        return existing

    def search(self, query: str, limit: int = 20) -> list[SearchHit]:
        return self._index.search(query, limit=limit)

    def rebuild_index_page(self) -> Path:
        lines = ["# Knowledge Base Index", ""]
        by_type: dict[str, list[KBEntry]] = {}
        for entry in self.list():
            by_type.setdefault(entry.entry_type, []).append(entry)
        for entry_type in sorted(by_type):
            lines.append(f"## {entry_type.title()}")
            for entry in sorted(by_type[entry_type], key=lambda e: e.slug):
                lines.append(f"- [[{entry.slug}]] — {entry.title}")
            lines.append("")
        path = self.root / "index.md"
        path.write_text("\n".join(lines), encoding="utf-8")
        return path
