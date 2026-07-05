"""File-based prompt library: prompts are markdown files the user owns and edits.

Prompts are re-read from disk on every call, so editing prompts/<name>.md takes
effect on the next request without a restart.
"""

from __future__ import annotations

from pathlib import Path

_VALID_NAME = r"abcdefghijklmnopqrstuvwxyz0123456789_-"


class PromptNotFound(Exception):
    pass


class PromptLibrary:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, name: str) -> Path:
        if not name or any(c not in _VALID_NAME for c in name.lower()):
            raise PromptNotFound(f"invalid prompt name {name!r}")
        return self.root / f"{name}.md"

    def names(self) -> list[str]:
        return sorted(p.stem for p in self.root.glob("*.md"))

    def get(self, name: str) -> str:
        path = self._path(name)
        if not path.exists():
            raise PromptNotFound(f"no prompt named {name!r} in {self.root}")
        return path.read_text(encoding="utf-8")

    def set(self, name: str, content: str) -> None:
        self._path(name).write_text(content, encoding="utf-8")
