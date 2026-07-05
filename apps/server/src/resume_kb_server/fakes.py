"""Canned extractor responses — used by tests and by KB_EXTRACTOR=fake demo mode."""

from doc_ingest import CVProfile, EducationItem, ExperienceItem
from knowledge_extract import FakeStructuredExtractor, ProfessionalUpdate, ProjectMention

FAKE_UPDATE = ProfessionalUpdate(
    summary="Completed the payment gateway migration",
    skills=["Python", "Kubernetes"],
    projects=[
        ProjectMention(
            name="Payment Gateway Migration",
            description="Migrated payments to a new gateway with zero downtime.",
        )
    ],
    achievements=["Zero-downtime cutover"],
    organizations=[],
)

FAKE_CV = CVProfile(
    name="Vivek Subramanian",
    headline="Senior Backend Engineer",
    summary="Backend engineer focused on payments infrastructure.",
    skills=["Python", "Kubernetes", "PostgreSQL"],
    experiences=[
        ExperienceItem(
            title="Senior Engineer",
            organization="Acme Corp",
            start="2022-01",
            end=None,
            description="Led the payments platform team.",
        )
    ],
    education=[EducationItem(institution="IIT Madras", degree="B.Tech")],
)


def build_fake_extractor() -> FakeStructuredExtractor:
    return FakeStructuredExtractor({ProfessionalUpdate: FAKE_UPDATE, CVProfile: FAKE_CV})
