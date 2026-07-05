"""Map extracted ProfessionalUpdate objects onto kb_core entries with wikilinks."""

from __future__ import annotations

from datetime import datetime, timezone

from kb_core import KBEntry, slugify

from knowledge_extract.schemas import ProfessionalUpdate


def update_to_entries(
    update: ProfessionalUpdate,
    source: str,
    transcript: str | None = None,
) -> list[KBEntry]:
    now = datetime.now(timezone.utc)
    skill_slugs = [f"skill-{slugify(s)}" for s in update.skills]
    project_slugs = [f"project-{slugify(p.name)}" for p in update.projects]
    note_slug = f"note-{now:%Y%m%d%H%M%S}-{slugify(update.summary)[:40]}".rstrip("-")

    body_parts = [update.summary]
    if transcript:
        body_parts += ["", "## Transcript", transcript]
    if update.achievements:
        body_parts += ["", "## Achievements"] + [f"- {a}" for a in update.achievements]
    if skill_slugs:
        body_parts += ["", "## Skills", ", ".join(f"[[{s}]]" for s in skill_slugs)]
    if project_slugs:
        body_parts += ["", "## Projects", ", ".join(f"[[{s}]]" for s in project_slugs)]

    entries = [
        KBEntry(
            slug=note_slug,
            title=update.summary[:80],
            entry_type="note",
            body="\n".join(body_parts),
            tags=["professional-update"],
            sources=[source],
            created_at=now,
            updated_at=now,
        )
    ]
    for name, slug in zip(update.skills, skill_slugs):
        entries.append(
            KBEntry(
                slug=slug,
                title=name,
                entry_type="skill",
                body=f"Mentioned in [[{note_slug}]].",
                tags=["skill"],
                sources=[source],
                created_at=now,
                updated_at=now,
            )
        )
    for project, slug in zip(update.projects, project_slugs):
        body = (project.description.strip() + f"\n\nMentioned in [[{note_slug}]].").strip()
        entries.append(
            KBEntry(
                slug=slug,
                title=project.name,
                entry_type="project",
                body=body,
                tags=["project"],
                sources=[source],
                created_at=now,
                updated_at=now,
            )
        )
    for org in update.organizations:
        entries.append(
            KBEntry(
                slug=f"org-{slugify(org)}",
                title=org,
                entry_type="organization",
                body=f"Mentioned in [[{note_slug}]].",
                tags=["organization"],
                sources=[source],
                created_at=now,
                updated_at=now,
            )
        )
    return entries
