"""KB entry model: OKF-style markdown files with YAML frontmatter and wikilinks."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

import yaml

WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")
_SLUG_RE = re.compile(r"[^a-z0-9]+")
_FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n?(.*)", re.DOTALL)

ENTRY_TYPES = ("note", "skill", "project", "experience", "organization", "person", "source")


def slugify(text: str) -> str:
    """Lowercase ASCII slug; non-alphanumerics collapse to single hyphens."""
    return _SLUG_RE.sub("-", text.lower()).strip("-")


def extract_wikilinks(body: str) -> list[str]:
    return WIKILINK_RE.findall(body)


@dataclass
class KBEntry:
    slug: str
    title: str
    entry_type: str
    body: str
    tags: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def to_markdown(self) -> str:
        meta = {
            "title": self.title,
            "type": self.entry_type,
            "tags": self.tags,
            "sources": self.sources,
            "created": self.created_at.isoformat() if self.created_at else None,
            "updated": self.updated_at.isoformat() if self.updated_at else None,
        }
        front = yaml.safe_dump(meta, sort_keys=True, allow_unicode=True)
        return f"---\n{front}---\n\n{self.body.strip()}\n"

    @classmethod
    def from_markdown(cls, text: str, slug: str) -> KBEntry:
        match = _FRONTMATTER_RE.match(text)
        if not match:
            raise ValueError(f"entry {slug!r} has no frontmatter")
        front, body = match.groups()
        meta = yaml.safe_load(front) or {}
        if not isinstance(meta, dict):
            raise ValueError(f"entry {slug!r} has malformed frontmatter")
        return cls(
            slug=slug,
            title=meta.get("title", slug),
            entry_type=meta.get("type", "note"),
            body=body.strip(),
            tags=list(meta.get("tags") or []),
            sources=list(meta.get("sources") or []),
            created_at=datetime.fromisoformat(meta["created"]) if meta.get("created") else None,
            updated_at=datetime.fromisoformat(meta["updated"]) if meta.get("updated") else None,
        )
