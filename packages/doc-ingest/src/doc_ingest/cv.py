"""CV profile schema and mapping to KB entries."""

from __future__ import annotations

from datetime import datetime, timezone

from kb_core import KBEntry, slugify
from pydantic import BaseModel, Field


class ExperienceItem(BaseModel):
    title: str
    organization: str
    start: str | None = None
    end: str | None = None
    description: str = ""


class EducationItem(BaseModel):
    institution: str
    degree: str | None = None


class CVProfile(BaseModel):
    name: str
    headline: str = ""
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experiences: list[ExperienceItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)


def cv_to_entries(profile: CVProfile, source: str) -> list[KBEntry]:
    now = datetime.now(timezone.utc)
    person_slug = f"person-{slugify(profile.name)}"
    skill_slugs = [f"skill-{slugify(s)}" for s in profile.skills]
    experience_slugs = [
        f"experience-{slugify(x.organization)}-{slugify(x.title)}" for x in profile.experiences
    ]

    body_parts = [profile.headline or profile.name]
    if profile.summary:
        body_parts += ["", profile.summary]
    if experience_slugs:
        body_parts += ["", "## Experience"] + [f"- [[{s}]]" for s in experience_slugs]
    if skill_slugs:
        body_parts += ["", "## Skills", ", ".join(f"[[{s}]]" for s in skill_slugs)]
    if profile.education:
        body_parts += ["", "## Education"] + [
            f"- {e.institution}" + (f" — {e.degree}" if e.degree else "") for e in profile.education
        ]

    entries = [
        KBEntry(
            slug=person_slug,
            title=profile.name,
            entry_type="person",
            body="\n".join(body_parts),
            tags=["cv"],
            sources=[source],
            created_at=now,
            updated_at=now,
        )
    ]
    for name, slug in zip(profile.skills, skill_slugs):
        entries.append(
            KBEntry(
                slug=slug,
                title=name,
                entry_type="skill",
                body=f"Listed on the CV of [[{person_slug}]].",
                tags=["skill", "cv"],
                sources=[source],
                created_at=now,
                updated_at=now,
            )
        )
    for experience, slug in zip(profile.experiences, experience_slugs):
        period = f"{experience.start or '?'} – {experience.end or 'present'}"
        body = (
            f"{experience.title} at {experience.organization} ({period}).\n\n"
            f"{experience.description}"
        ).strip()
        entries.append(
            KBEntry(
                slug=slug,
                title=f"{experience.title} @ {experience.organization}",
                entry_type="experience",
                body=body + f"\n\nProfile: [[{person_slug}]].",
                tags=["experience", "cv"],
                sources=[source],
                created_at=now,
                updated_at=now,
            )
        )
    return entries
