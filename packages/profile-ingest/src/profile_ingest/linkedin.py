"""LinkedIn official data-export ZIP parser (ToS-safe: no scraping)."""

from __future__ import annotations

import csv
import io
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from kb_core import KBEntry, slugify
from pydantic import BaseModel, Field


class LinkedInPosition(BaseModel):
    organization: str
    title: str
    description: str = ""
    start: str = ""
    end: str = ""


class LinkedInEducation(BaseModel):
    institution: str
    degree: str = ""


class LinkedInProfile(BaseModel):
    name: str = ""
    headline: str = ""
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    positions: list[LinkedInPosition] = Field(default_factory=list)
    education: list[LinkedInEducation] = Field(default_factory=list)


def _read_csv(archive: zipfile.ZipFile, filename: str) -> list[dict[str, str]]:
    for member in archive.namelist():
        if member.split("/")[-1].lower() == filename.lower():
            with archive.open(member) as fh:
                text = io.TextIOWrapper(fh, encoding="utf-8-sig")
                return [dict(row) for row in csv.DictReader(text)]
    return []


def parse_linkedin_export(zip_path: Path) -> LinkedInProfile:
    with zipfile.ZipFile(zip_path) as archive:
        profile_rows = _read_csv(archive, "Profile.csv")
        positions_rows = _read_csv(archive, "Positions.csv")
        skills_rows = _read_csv(archive, "Skills.csv")
        education_rows = _read_csv(archive, "Education.csv")

    name = headline = summary = ""
    if profile_rows:
        row = profile_rows[0]
        name = f"{row.get('First Name', '')} {row.get('Last Name', '')}".strip()
        headline = row.get("Headline", "") or ""
        summary = row.get("Summary", "") or ""

    return LinkedInProfile(
        name=name,
        headline=headline,
        summary=summary,
        skills=[r["Name"] for r in skills_rows if r.get("Name")],
        positions=[
            LinkedInPosition(
                organization=r.get("Company Name", "") or "",
                title=r.get("Title", "") or "",
                description=r.get("Description", "") or "",
                start=r.get("Started On", "") or "",
                end=r.get("Finished On", "") or "",
            )
            for r in positions_rows
            if r.get("Company Name")
        ],
        education=[
            LinkedInEducation(
                institution=r.get("School Name", "") or "",
                degree=r.get("Degree Name", "") or "",
            )
            for r in education_rows
            if r.get("School Name")
        ],
    )


def linkedin_to_entries(profile: LinkedInProfile) -> list[KBEntry]:
    now = datetime.now(timezone.utc)
    source = "linkedin-export"
    person_slug = f"person-{slugify(profile.name)}" if profile.name else "person-linkedin"
    position_slugs = [
        f"experience-{slugify(p.organization)}-{slugify(p.title)}" for p in profile.positions
    ]
    skill_slugs = [f"skill-{slugify(s)}" for s in profile.skills]

    body_parts = [profile.headline or profile.name or "LinkedIn profile"]
    if profile.summary:
        body_parts += ["", profile.summary]
    if position_slugs:
        body_parts += ["", "## Experience"] + [f"- [[{s}]]" for s in position_slugs]
    if skill_slugs:
        body_parts += ["", "## Skills", ", ".join(f"[[{s}]]" for s in skill_slugs)]
    if profile.education:
        body_parts += ["", "## Education"] + [
            f"- {e.institution}" + (f" — {e.degree}" if e.degree else "") for e in profile.education
        ]

    entries = [
        KBEntry(
            slug=person_slug,
            title=profile.name or "LinkedIn profile",
            entry_type="person",
            body="\n".join(body_parts),
            tags=["linkedin"],
            sources=[source],
            created_at=now,
            updated_at=now,
        )
    ]
    for position, slug in zip(profile.positions, position_slugs):
        period = f"{position.start or '?'} – {position.end or 'present'}"
        body = (
            f"{position.title} at {position.organization} ({period}).\n\n"
            f"{position.description}\n\nProfile: [[{person_slug}]]."
        ).strip()
        entries.append(
            KBEntry(
                slug=slug,
                title=f"{position.title} @ {position.organization}",
                entry_type="experience",
                body=body,
                tags=["experience", "linkedin"],
                sources=[source],
                created_at=now,
                updated_at=now,
            )
        )
    for name, slug in zip(profile.skills, skill_slugs):
        entries.append(
            KBEntry(
                slug=slug,
                title=name,
                entry_type="skill",
                body=f"Listed on LinkedIn profile [[{person_slug}]].",
                tags=["skill", "linkedin"],
                sources=[source],
                created_at=now,
                updated_at=now,
            )
        )
    return entries
