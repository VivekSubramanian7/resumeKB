import pytest
from fastapi.testclient import TestClient

from resume_kb_server.app import create_app
from helpers import e2e_settings

pytestmark = pytest.mark.e2e


class _ExplodingTranscriber:
    def transcribe(self, path, max_seconds=120.0):  # pragma: no cover
        raise AssertionError("transcription must not run for over-long audio")


@pytest.fixture()
def client(tmp_path, prompts_dir):
    return TestClient(
        create_app(e2e_settings(tmp_path, prompts_root=prompts_dir), transcriber=_ExplodingTranscriber())
    )


def test_overlong_note_is_rejected_before_transcription(client, overlong_tone_wav):
    with open(overlong_tone_wav, "rb") as f:
        response = client.post("/api/notes", files={"audio": ("long.wav", f, "audio/wav")})
    assert response.status_code == 422
    assert "120" in response.json()["detail"]
