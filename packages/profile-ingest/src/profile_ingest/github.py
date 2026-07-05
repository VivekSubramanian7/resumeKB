"""GitHub REST ingestion: profile + top repos + languages + README excerpts."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
from kb_core import KBEntry, slugify
from pydantic import BaseModel, Field

README_EXCERPT_CHARS = 2000
MAX_REPOS = 10


class RepoInfo(BaseModel):
    name: str
    description: str = ""
    stars: int = 0
    topics: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    readme_excerpt: str = ""


class GitHubProfile(BaseModel):
    username: str
    name: str = ""
    bio: str = ""
    repos: list[RepoInfo] = Field(default_factory=list)


class GitHubClient:
    def __init__(self, token: str | None = None, base_url: str = "https://api.github.com"):
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "resumeKB"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._client = httpx.Client(base_url=base_url, headers=headers, timeout=30.0)

    def fetch_profile(self, username: str) -> GitHubProfile:
        user = self._get_json(f"/users/{username}")
        raw_repos = self._get_json(
            f"/users/{username}/repos", params={"sort": "pushed", "per_page": 30}
        )
        repos: list[RepoInfo] = []
        for raw in raw_repos:
            if raw.get("fork"):
                continue
            repos.append(
                RepoInfo(
                    name=raw["name"],
                    description=raw.get("description") or "",
                    stars=raw.get("stargazers_count", 0),
                    topics=raw.get("topics") or [],
                    languages=self._languages(username, raw["name"]),
                    readme_excerpt=self._readme(username, raw["name"]),
                )
            )
            if len(repos) >= MAX_REPOS:
                break
        return GitHubProfile(
            username=username,
            name=user.get("name") or "",
            bio=user.get("bio") or "",
            repos=repos,
        )

    def _get_json(self, path: str, params: dict | None = None):
        response = self._client.get(path, params=params)
        response.raise_for_status()
        return response.json()

    def _languages(self, username: str, repo: str) -> list[str]:
        try:
            return list(self._get_json(f"/repos/{username}/{repo}/languages").keys())
        except httpx.HTTPStatusError:
            return []

    def _readme(self, username: str, repo: str) -> str:
        response = self._client.get(
            f"/repos/{username}/{repo}/readme",
            headers={"Accept": "application/vnd.github.raw+json"},
        )
        if response.status_code != 200:
            return ""
        return response.text[:README_EXCERPT_CHARS]


def github_to_entries(profile: GitHubProfile) -> list[KBEntry]:
    now = datetime.now(timezone.utc)
    source = f"github:{profile.username}"
    source_slug = f"source-github-{slugify(profile.username)}"
    repo_slugs = [f"project-{slugify(r.name)}" for r in profile.repos]

    all_languages: list[str] = []
    for repo in profile.repos:
        for lang in repo.languages:
            if lang not in all_languages:
                all_languages.append(lang)

    body_parts = [f"GitHub profile of {profile.name or profile.username}."]
    if profile.bio:
        body_parts += ["", profile.bio]
    if repo_slugs:
        body_parts += ["", "## Repositories"] + [f"- [[{s}]]" for s in repo_slugs]

    entries = [
        KBEntry(
            slug=source_slug,
            title=f"GitHub: {profile.username}",
            entry_type="source",
            body="\n".join(body_parts),
            tags=["github"],
            sources=[source],
            created_at=now,
            updated_at=now,
        )
    ]
    for repo, slug in zip(profile.repos, repo_slugs):
        body = "\n".join(
            filter(
                None,
                [
                    repo.description,
                    f"Languages: {', '.join(repo.languages)}" if repo.languages else "",
                    f"Topics: {', '.join(repo.topics)}" if repo.topics else "",
                    f"Stars: {repo.stars}",
                    "",
                    repo.readme_excerpt,
                    "",
                    f"Source: [[{source_slug}]].",
                ],
            )
        )
        entries.append(
            KBEntry(
                slug=slug,
                title=repo.name,
                entry_type="project",
                body=body,
                tags=["project", "github"],
                sources=[source],
                created_at=now,
                updated_at=now,
            )
        )
    for lang in all_languages:
        entries.append(
            KBEntry(
                slug=f"skill-{slugify(lang)}",
                title=lang,
                entry_type="skill",
                body=f"Used in repositories on [[{source_slug}]].",
                tags=["skill", "github"],
                sources=[source],
                created_at=now,
                updated_at=now,
            )
        )
    return entries
