"""Full pipeline: real WAV upload → real whisper transcription → extraction → KB on disk."""

import shutil

import pytest
from fastapi.testclient import TestClient

from resume_kb_server.app import create_app
from resume_kb_server.settings import Settings

pytestmark = [pytest.mark.e2e, pytest.mark.transcription]


@pytest.fixture()
def client(tmp_path):
    prompts_dir = tmp_path / "prompts"
    shutil.copytree("prompts", prompts_dir)
    settings = Settings(
        kb_root=tmp_path / "kb",
        prompts_root=prompts_dir,
        extractor_backend="fake",
        whisper_model="tiny",
        whisper_device="cpu",
        whisper_compute_type="int8",
    )
    return TestClient(create_app(settings))


def test_voice_note_creates_kb_entries_and_is_searchable(client, speech_wav, tmp_path):
    with open(speech_wav, "rb") as f:
        response = client.post("/api/notes", files={"audio": ("note.wav", f, "audio/wav")})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["language"] == "en"
    assert len(data["transcript"]) > 10
    assert data["entries"], "expected KB entries to be created"

    # Fake extractor is deterministic → these slugs must exist on disk.
    assert (tmp_path / "kb" / "skill" / "skill-python.md").exists()
    assert (tmp_path / "kb" / "skill" / "skill-kubernetes.md").exists()
    assert (tmp_path / "kb" / "index.md").exists()

    # And they are searchable end-to-end.
    hits = client.get("/api/kb/search", params={"q": "kubernetes"}).json()
    assert any(h["slug"] == "skill-kubernetes" for h in hits)

    # Entry detail endpoint round-trips.
    detail = client.get("/api/kb/entries/skill-python").json()
    assert detail["title"] == "Python"
    assert detail["entry_type"] == "skill"
