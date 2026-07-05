"""Document → markdown conversion via markitdown (PDF and DOCX)."""

from __future__ import annotations

from pathlib import Path

from markitdown import MarkItDown

SUPPORTED_SUFFIXES = {".pdf", ".docx"}


class UnsupportedDocumentType(Exception):
    pass


def convert_to_markdown(path: Path) -> str:
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise UnsupportedDocumentType(
            f"{suffix or 'file without extension'} is not supported; "
            f"upload a PDF or DOCX (convert legacy .doc files to .docx first)"
        )
    result = MarkItDown().convert(str(path))
    return result.text_content
