"""File-based storage for pending probe questions."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from knowledge_extract.probe import ProbeQuestion


class ProbeStore:
    """Manages a single pending probe per user as a JSON file."""

    def __init__(self, kb_data_dir: Path, user_id: str) -> None:
        self._path = Path(kb_data_dir) / user_id / ".kb" / "pending_probe.json"

    def save(self, probe: ProbeQuestion) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "question": probe.question,
            "context": probe.context,
            "related_entries": probe.related_entries,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "served": False,
        }
        self._path.write_text(json.dumps(data), encoding="utf-8")

    def load(self) -> ProbeQuestion | None:
        if not self._path.exists():
            return None
        data = json.loads(self._path.read_text(encoding="utf-8"))
        return ProbeQuestion(
            question=data["question"],
            context=data["context"],
            related_entries=data["related_entries"],
        )

    def mark_served(self) -> None:
        if not self._path.exists():
            return
        data = json.loads(self._path.read_text(encoding="utf-8"))
        data["served"] = True
        self._path.write_text(json.dumps(data), encoding="utf-8")

    def is_served(self) -> bool:
        if not self._path.exists():
            return False
        data = json.loads(self._path.read_text(encoding="utf-8"))
        return data.get("served", False)

    def clear(self) -> None:
        self._path.unlink(missing_ok=True)
