"""Auth enforcement when AUTH_DISABLED is false."""

import shutil

import pytest
from fastapi.testclient import TestClient

from resume_kb_server.app import create_app
from resume_kb_server.settings import Settings

pytestmark = pytest.mark.e2e


@pytest.fixture()
def authed_client(tmp_path):
    prompts_dir = tmp_path / "prompts"
    shutil.copytree("prompts", prompts_dir)
    settings = Settings(
        kb_data_dir=tmp_path / "kb-data",
        prompts_root=prompts_dir,
        extractor_backend="fake",
        auth_disabled=False,
        supabase_url="https://example.supabase.co",
        supabase_anon_key="test-anon-key",
    )
    return TestClient(create_app(settings))


def test_kb_entries_requires_auth(authed_client):
    response = authed_client.get("/api/kb/entries")
    assert response.status_code == 401
    assert "Authorization" in response.json()["detail"]


def test_kb_search_requires_auth(authed_client):
    response = authed_client.get("/api/kb/search", params={"q": "python"})
    assert response.status_code == 401


def test_prompts_require_auth(authed_client):
    response = authed_client.get("/api/prompts")
    assert response.status_code == 401


def test_notes_requires_auth(authed_client):
    response = authed_client.post("/api/notes", files={"audio": ("note.webm", b"fake", "audio/webm")})
    assert response.status_code == 401


def test_documents_requires_auth(authed_client):
    response = authed_client.post(
        "/api/documents",
        files={"document": ("cv.pdf", b"fake", "application/pdf")},
    )
    assert response.status_code == 401


def test_github_ingest_requires_auth(authed_client):
    response = authed_client.post("/api/sources/github", json={"username": "octocat"})
    assert response.status_code == 401


def test_config_is_public_without_auth(authed_client):
    response = authed_client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert data["auth_required"] is True
