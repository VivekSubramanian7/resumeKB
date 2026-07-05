"""Pydantic schemas for structured extraction."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProjectMention(BaseModel):
    name: str
    description: str = ""


class ProfessionalUpdate(BaseModel):
    summary: str = Field(description="One-sentence summary of the update")
    skills: list[str] = Field(default_factory=list)
    projects: list[ProjectMention] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    organizations: list[str] = Field(default_factory=list)
