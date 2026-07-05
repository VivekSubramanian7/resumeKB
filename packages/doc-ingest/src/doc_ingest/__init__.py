"""doc_ingest: reusable document conversion and CV profile extraction."""

from doc_ingest.convert import SUPPORTED_SUFFIXES, UnsupportedDocumentType, convert_to_markdown
from doc_ingest.cv import CVProfile, EducationItem, ExperienceItem, cv_to_entries

__all__ = [
    "CVProfile",
    "EducationItem",
    "ExperienceItem",
    "SUPPORTED_SUFFIXES",
    "UnsupportedDocumentType",
    "convert_to_markdown",
    "cv_to_entries",
]
